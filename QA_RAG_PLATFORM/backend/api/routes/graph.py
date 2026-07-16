"""
Knowledge Graph REST API.

When NEO4J_URI is not set, all endpoints return {"graph_enabled": false}
so the frontend can gracefully hide graph-related UI.

Endpoints:
  GET  /api/graph/health                     — connectivity check
  GET  /api/graph/stats                      — node + edge counts
  GET  /api/graph/nodes/{label}              — list nodes by type
  GET  /api/graph/impact/story/{story_id}    — full impact view for a story
  GET  /api/graph/impact/requirement/{req_id}
  GET  /api/graph/impact/module/{module_id}
  GET  /api/graph/coverage/story/{story_id} — test cases covering story
  GET  /api/graph/uncovered-stories          — stories with no test coverage
  GET  /api/graph/release/{release_id}/readiness
  GET  /api/graph/bugs/story/{story_id}
  GET  /api/graph/bugs/open
  GET  /api/graph/path                       — shortest path between two nodes
  POST /api/graph/populate/jira/{connector_id} — trigger graph population from Jira connector
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlmodel import Session

from backend.database.db import get_session
from backend.graph import neo4j_client
from backend.graph import impact_analyzer as ia

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/graph", tags=["Knowledge Graph"])

_DISABLED_RESPONSE = {"graph_enabled": False, "message": "Set NEO4J_URI to enable the Knowledge Graph."}


def _require_graph():
    if not neo4j_client.is_enabled():
        raise HTTPException(503, "Knowledge Graph is not configured. Set NEO4J_URI environment variable.")


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health")
def graph_health():
    status = neo4j_client.health()
    return {"graph_enabled": neo4j_client.is_enabled(), **status}


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
def graph_stats(
    team_id: Optional[str] = Query(None),
):
    if not neo4j_client.is_enabled():
        return _DISABLED_RESPONSE
    return {"graph_enabled": True, **ia.graph_stats(team_id=team_id)}


# ── List nodes by label ───────────────────────────────────────────────────────

_VALID_LABELS = {"Requirement", "Epic", "Story", "TestCase", "Bug", "Feature", "Module", "Release", "APIEndpoint"}


@router.get("/nodes/{label}")
def list_nodes(
    label: str,
    team_id: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
):
    if not neo4j_client.is_enabled():
        return _DISABLED_RESPONSE
    if label not in _VALID_LABELS:
        raise HTTPException(400, f"Unknown node type '{label}'. Valid: {sorted(_VALID_LABELS)}")
    team_clause = "WHERE n.team_id = $team_id" if team_id else ""
    rows = neo4j_client.run_query(
        f"MATCH (n:{label}) {team_clause} RETURN properties(n) AS props ORDER BY n.updated_at DESC LIMIT $limit",
        {"team_id": team_id or "", "limit": limit},
    )
    return {"label": label, "nodes": [r["props"] for r in rows], "count": len(rows)}


# ── Impact ────────────────────────────────────────────────────────────────────

@router.get("/impact/story/{story_id}")
def story_impact(
    story_id: str,
    team_id: Optional[str] = Query(None),
):
    _require_graph()
    return {"graph_enabled": True, **ia.get_story_impact(story_id, team_id=team_id)}


@router.get("/impact/requirement/{req_id}")
def requirement_impact(
    req_id: str,
    team_id: Optional[str] = Query(None),
):
    _require_graph()
    return {"graph_enabled": True, **ia.get_requirement_impact(req_id, team_id=team_id)}


@router.get("/impact/module/{module_id}")
def module_impact(
    module_id: str,
    team_id: Optional[str] = Query(None),
):
    _require_graph()
    return {"graph_enabled": True, **ia.get_module_impact(module_id, team_id=team_id)}


# ── Coverage ──────────────────────────────────────────────────────────────────

@router.get("/coverage/story/{story_id}")
def story_coverage(
    story_id: str,
    team_id: Optional[str] = Query(None),
):
    _require_graph()
    tests = ia.get_test_coverage(story_id, team_id=team_id)
    return {
        "story_id":    story_id,
        "test_cases":  tests,
        "covered":     len(tests) > 0,
        "test_count":  len(tests),
    }


@router.get("/uncovered-stories")
def uncovered_stories(
    team_id: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
):
    if not neo4j_client.is_enabled():
        return _DISABLED_RESPONSE
    stories = ia.get_uncovered_stories(team_id=team_id, limit=limit)
    return {"uncovered_stories": stories, "count": len(stories)}


# ── Release readiness ─────────────────────────────────────────────────────────

@router.get("/release/{release_id}/readiness")
def release_readiness(release_id: str):
    _require_graph()
    return {"graph_enabled": True, **ia.get_release_readiness(release_id)}


# ── Bugs ──────────────────────────────────────────────────────────────────────

@router.get("/bugs/story/{story_id}")
def bugs_for_story(story_id: str):
    _require_graph()
    bugs = ia.get_bugs_for_story(story_id)
    return {"story_id": story_id, "bugs": bugs, "count": len(bugs)}


@router.get("/bugs/open")
def open_bugs(
    team_id: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
):
    if not neo4j_client.is_enabled():
        return _DISABLED_RESPONSE
    bugs = ia.get_open_bugs(team_id=team_id, limit=limit)
    return {"bugs": bugs, "count": len(bugs)}


# ── Shortest path ─────────────────────────────────────────────────────────────

@router.get("/path")
def graph_path(
    from_id: str = Query(..., description="Source node id"),
    to_id:   str = Query(..., description="Target node id"),
    max_hops: int = Query(6, le=10),
):
    _require_graph()
    path = ia.shortest_path(from_id, to_id, max_hops=max_hops)
    return {
        "from_id": from_id,
        "to_id":   to_id,
        "path":    path,
        "hops":    len(path) - 1 if len(path) > 1 else 0,
        "connected": bool(path),
    }


# ── Populate from Jira connector ──────────────────────────────────────────────

@router.post("/populate/jira/{connector_id}")
def populate_from_jira(
    connector_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_session),
):
    """
    Re-read all Jira issues for a connector and populate/update graph nodes.
    Runs in background; returns immediately.
    """
    _require_graph()
    from backend.models.connector import DataConnector
    conn = db.get(DataConnector, connector_id)
    if not conn:
        raise HTTPException(404, "Connector not found")
    if conn.connector_type != "jira":
        raise HTTPException(400, "Only Jira connectors can populate the graph")

    background_tasks.add_task(_bg_populate_jira, connector_id, conn.team_id)
    return {"status": "started", "connector_id": connector_id, "message": "Graph population running in background"}


def _bg_populate_jira(connector_id: str, team_id: Optional[str]) -> None:
    from sqlmodel import Session as _S
    from backend.database.db import engine
    from backend.models.connector import DataConnector
    from backend.services.jira_connector import JiraConnector
    from backend.graph.graph_builder import GraphBuilder
    import base64

    with _S(engine) as db:
        conn = db.get(DataConnector, connector_id)
        if not conn:
            return
        api_token = base64.b64decode(conn.api_token_enc.encode()).decode()
        client = JiraConnector(conn.base_url, conn.email, api_token)
        project_keys = [k.strip() for k in conn.project_keys.split(",") if k.strip()]
        if not project_keys:
            project_keys = [p["key"] for p in client.list_projects()]

        builder = GraphBuilder(team_id=team_id or "")
        count = 0
        for issue in client.iter_issues(project_keys):
            try:
                builder.populate_from_jira_issue(issue)
                count += 1
            except Exception as exc:
                logger.warning("Graph populate skip %s: %s", issue.key, exc)

        logger.info("Graph population complete: %d nodes upserted from connector %s", count, connector_id)


# ── Populate from CI connector ────────────────────────────────────────────────

class CIPopulateRequest(BaseModel if False else object):
    pass


from pydantic import BaseModel as _BM


class CIPopulateBody(_BM):
    ci_system:  str                    # "github_actions" | "gitlab_ci"
    token:      str                    # API token / PAT
    repo:       str                    # "owner/repo" for GitHub; project_id for GitLab
    base_url:   str = "https://github.com"  # GitLab self-hosted base URL
    branch:     Optional[str] = None
    limit:      int = 50
    team_id:    Optional[str] = None
    release_id: Optional[str] = None   # link runs to this Release node


@router.post("/populate/ci")
def populate_from_ci(
    body: CIPopulateBody,
    background_tasks: BackgroundTasks,
):
    """
    Ingest CI/CD pipeline runs into the Knowledge Graph.
    Supports GitHub Actions and GitLab CI.
    Runs in background; returns immediately.
    """
    _require_graph()
    background_tasks.add_task(
        _bg_populate_ci,
        body.ci_system, body.token, body.repo, body.base_url,
        body.branch, body.limit, body.team_id or "", body.release_id,
    )
    return {
        "status":    "started",
        "ci_system": body.ci_system,
        "repo":      body.repo,
        "message":   "CI graph population running in background",
    }


def _bg_populate_ci(
    ci_system: str,
    token: str,
    repo: str,
    base_url: str,
    branch: Optional[str],
    limit: int,
    team_id: str,
    release_id: Optional[str],
) -> None:
    from backend.graph.graph_builder import GraphBuilder
    builder = GraphBuilder(team_id=team_id)

    if ci_system == "github_actions":
        from backend.services.ci_connector import GitHubActionsConnector
        owner, repo_name = (repo.split("/", 1) + [""])[:2]
        client = GitHubActionsConnector(token=token, owner=owner, repo=repo_name)
        runs = list(client.iter_pipeline_runs(branch=branch, limit=limit))
        for run in runs:
            node = run.to_graph_node(team_id=team_id)
            if release_id:
                node["release_id"] = release_id
            try:
                builder.upsert_pipeline_run(node)
            except Exception as exc:
                logger.warning("CI graph upsert failed for run %s: %s", run.run_id, exc)

    elif ci_system == "gitlab_ci":
        from backend.services.ci_connector import GitLabCIConnector
        client = GitLabCIConnector(base_url=base_url, token=token, project_id=repo)
        runs = list(client.iter_pipeline_runs(ref=branch, limit=limit))
        for run in runs:
            node = run.to_graph_node(team_id=team_id)
            if release_id:
                node["release_id"] = release_id
            try:
                builder.upsert_pipeline_run(node)
            except Exception as exc:
                logger.warning("CI graph upsert failed for run %s: %s", run.run_id, exc)
    else:
        logger.warning("_bg_populate_ci: unknown ci_system '%s'", ci_system)
        return

    logger.info(
        "CI graph population complete: %d PipelineRun nodes upserted (%s, repo=%s)",
        len(runs), ci_system, repo,
    )
