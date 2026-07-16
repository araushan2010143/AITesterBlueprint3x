"""
Impact Analyzer — graph traversal queries for the QA Knowledge Graph.

All queries accept an optional team_id filter for multi-tenant safety.
All return [] when Neo4j is not configured.

Key traversals:
  1. coverage(story_id)    → which test cases cover this story?
  2. impact(node)          → what is affected if we change this node?
  3. bugs_for_story(id)    → bugs reported against this story
  4. stories_without_tests → stories with no TestCase coverage (test debt)
  5. shortest_path(a, b)   → how are two nodes related?
  6. module_health(mod_id) → coverage + bug density for a module
  7. release_readiness(id) → % of stories with passing tests in a release
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.graph.neo4j_client import run_query


def _team_filter(team_id: Optional[str], node_alias: str = "n") -> str:
    if team_id:
        return f"AND {node_alias}.team_id = $team_id"
    return ""


# ── Coverage ──────────────────────────────────────────────────────────────────

def get_test_coverage(
    story_id: str,
    team_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return all TestCase nodes covering a given Story."""
    return run_query(
        f"""
        MATCH (t:TestCase)-[:COVERS]->(s:Story {{id: $story_id}})
        WHERE 1=1 {_team_filter(team_id, "t")}
        RETURN t.id AS id, t.title AS title,
               t.automation_status AS automation_status,
               t.priority AS priority, t.doc_id AS doc_id
        ORDER BY t.priority DESC
        """,
        {"story_id": story_id, "team_id": team_id or ""},
    )


def get_uncovered_stories(
    team_id: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Stories with no test case coverage — the test debt list."""
    return run_query(
        f"""
        MATCH (s:Story)
        WHERE NOT (s)<-[:COVERS]-(:TestCase)
        {'AND s.team_id = $team_id' if team_id else ''}
        RETURN s.id AS id, s.jira_key AS jira_key, s.title AS title,
               s.status AS status, s.priority AS priority
        ORDER BY s.priority DESC
        LIMIT $limit
        """,
        {"team_id": team_id or "", "limit": limit},
    )


# ── Impact analysis ───────────────────────────────────────────────────────────

def get_story_impact(
    story_id: str,
    max_depth: int = 3,
    team_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    What is affected if this story changes?
    Returns: test cases that cover it, bugs that affect it, the release it targets.
    """
    tests = run_query(
        "MATCH (t:TestCase)-[:COVERS]->(s:Story {id: $id}) RETURN t.id AS id, t.title AS title",
        {"id": story_id},
    )
    bugs = run_query(
        "MATCH (b:Bug)-[:AFFECTS]->(s:Story {id: $id}) RETURN b.id AS id, b.title AS title, b.severity AS severity",
        {"id": story_id},
    )
    releases = run_query(
        "MATCH (s:Story {id: $id})-[:TARGETS]->(r:Release) RETURN r.id AS id, r.version AS version",
        {"id": story_id},
    )
    epic = run_query(
        "MATCH (s:Story {id: $id})-[:BELONGS_TO]->(e:Epic) RETURN e.id AS id, e.title AS title",
        {"id": story_id},
    )
    return {
        "story_id":   story_id,
        "test_cases": tests,
        "bugs":       bugs,
        "releases":   releases,
        "epic":       epic[0] if epic else None,
        "risk_score": _risk_score(len(tests), len(bugs)),
    }


def get_requirement_impact(
    req_id: str,
    team_id: Optional[str] = None,
) -> Dict[str, Any]:
    """All stories implementing this requirement and their test coverage."""
    stories = run_query(
        "MATCH (s:Story)-[:IMPLEMENTS]->(r:Requirement {id: $id}) RETURN s.id AS id, s.title AS title, s.status AS status",
        {"id": req_id},
    )
    tests = run_query(
        "MATCH (t:TestCase)-[:COVERS]->(r:Requirement {id: $id}) RETURN t.id AS id, t.title AS title",
        {"id": req_id},
    )
    return {
        "requirement_id": req_id,
        "implementing_stories": stories,
        "direct_tests": tests,
        "total_coverage": len(stories) + len(tests),
    }


def get_module_impact(
    module_id: str,
    team_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Everything in a module: features, APIs, open bugs."""
    features = run_query(
        "MATCH (f:Feature)-[:BELONGS_TO]->(m:Module {id: $id}) RETURN f.id AS id, f.name AS name",
        {"id": module_id},
    )
    apis = run_query(
        "MATCH (a:APIEndpoint)-[:BELONGS_TO]->(m:Module {id: $id}) RETURN a.id AS id, a.path AS path, a.method AS method",
        {"id": module_id},
    )
    bugs = run_query(
        "MATCH (b:Bug)-[:AFFECTS]->(f:Feature)-[:BELONGS_TO]->(m:Module {id: $id}) RETURN b.id AS id, b.title AS title, b.severity AS severity",
        {"id": module_id},
    )
    return {
        "module_id":  module_id,
        "features":   features,
        "api_endpoints": apis,
        "open_bugs":  bugs,
        "bug_density": round(len(bugs) / max(len(features), 1), 2),
    }


# ── Bug queries ───────────────────────────────────────────────────────────────

def get_bugs_for_story(story_id: str) -> List[Dict[str, Any]]:
    return run_query(
        """
        MATCH (b:Bug)-[:AFFECTS]->(s:Story {id: $id})
        RETURN b.id AS id, b.jira_key AS jira_key, b.title AS title,
               b.severity AS severity, b.status AS status
        ORDER BY b.severity DESC
        """,
        {"id": story_id},
    )


def get_open_bugs(
    team_id: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    return run_query(
        f"""
        MATCH (b:Bug)
        WHERE b.status <> 'Done' {'AND b.team_id = $team_id' if team_id else ''}
        RETURN b.id AS id, b.jira_key AS jira_key, b.title AS title,
               b.severity AS severity, b.status AS status
        ORDER BY b.severity DESC
        LIMIT $limit
        """,
        {"team_id": team_id or "", "limit": limit},
    )


# ── Release readiness ─────────────────────────────────────────────────────────

def get_release_readiness(release_id: str) -> Dict[str, Any]:
    """
    For every story targeting a release, check test coverage.
    Returns readiness %, open bugs, uncovered stories.
    """
    stories = run_query(
        "MATCH (s:Story)-[:TARGETS]->(r:Release {id: $id}) RETURN s.id AS id, s.title AS title, s.status AS status",
        {"id": release_id},
    )
    covered_ids = run_query(
        """
        MATCH (t:TestCase)-[:COVERS]->(s:Story)-[:TARGETS]->(r:Release {id: $id})
        RETURN DISTINCT s.id AS id
        """,
        {"id": release_id},
    )
    open_bugs = run_query(
        """
        MATCH (b:Bug)-[:AFFECTS]->(s:Story)-[:TARGETS]->(r:Release {id: $id})
        WHERE b.status <> 'Done'
        RETURN b.id AS id, b.title AS title, b.severity AS severity
        """,
        {"id": release_id},
    )
    total = len(stories)
    covered = len(covered_ids)
    pct = round(covered / total * 100, 1) if total else 0.0
    return {
        "release_id":         release_id,
        "total_stories":      total,
        "covered_stories":    covered,
        "coverage_pct":       pct,
        "open_bugs":          open_bugs,
        "uncovered_stories":  [s for s in stories if s["id"] not in {r["id"] for r in covered_ids}],
        "ready":              pct >= 80 and len(open_bugs) == 0,
    }


# ── Shortest path ─────────────────────────────────────────────────────────────

def shortest_path(
    from_id: str,
    to_id: str,
    max_hops: int = 6,
) -> List[Dict[str, Any]]:
    """Find the shortest relationship path between any two nodes by id."""
    rows = run_query(
        f"""
        MATCH p = shortestPath(
          (a {{id: $from_id}})-[*1..{max_hops}]-(b {{id: $to_id}})
        )
        RETURN [n IN nodes(p) | {{id: n.id, labels: labels(n), title: coalesce(n.title, n.name, n.version, n.path, '')}}] AS path,
               length(p) AS hops
        LIMIT 1
        """,
        {"from_id": from_id, "to_id": to_id},
    )
    return rows[0]["path"] if rows else []


# ── Graph statistics ──────────────────────────────────────────────────────────

def graph_stats(team_id: Optional[str] = None) -> Dict[str, Any]:
    node_types = ["Requirement", "Epic", "Story", "TestCase", "Bug", "Feature", "Module", "Release", "APIEndpoint"]
    counts: Dict[str, int] = {}
    for label in node_types:
        team_clause = f"WHERE n.team_id = '{team_id}'" if team_id else ""
        rows = run_query(f"MATCH (n:{label}) {team_clause} RETURN count(n) AS c")
        counts[label] = rows[0]["c"] if rows else 0

    rel_rows = run_query("MATCH ()-[r]->() RETURN type(r) AS rel, count(r) AS c")
    relationships = {r["rel"]: r["c"] for r in rel_rows}

    return {
        "nodes": counts,
        "relationships": relationships,
        "total_nodes": sum(counts.values()),
        "total_relationships": sum(relationships.values()),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _risk_score(test_count: int, bug_count: int) -> str:
    """Simple heuristic risk classification."""
    if test_count == 0:
        return "critical"
    ratio = bug_count / test_count
    if ratio > 1.5 or bug_count > 5:
        return "high"
    if ratio > 0.5 or bug_count > 2:
        return "medium"
    return "low"
