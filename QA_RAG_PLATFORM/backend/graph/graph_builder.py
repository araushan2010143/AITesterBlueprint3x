"""
Graph Builder — MERGE-based upserts for all Knowledge Graph node and relationship types.

All functions are idempotent: calling them twice with the same data produces
no duplicates. Neo4j MERGE matches on the 'id' property and SET updates
other properties on every call.

Usage from connectors:
  from backend.graph.graph_builder import GraphBuilder
  builder = GraphBuilder(team_id="team-abc")
  builder.upsert_epic({"id": "QA-1", "title": "Auth Epic", "status": "In Progress"})
  builder.upsert_story({"id": "QA-12", "title": "Login flow", "status": "Done", "epic_id": "QA-1"})
  builder.upsert_test_case({"id": "chunk-uuid", "title": "Test login", "story_id": "QA-12"})
"""
from __future__ import annotations

import logging
import re
import unicodedata
from typing import Any, Dict, List, Optional

from backend.graph.neo4j_client import run_query

logger = logging.getLogger(__name__)


def _slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^\w\s\-]", "", text)
    return re.sub(r"[\s_\-]+", "-", text).strip("-").lower()


class GraphBuilder:
    """
    Builds Knowledge Graph nodes and edges.
    Inject team_id to keep multi-tenant data separated.
    """

    def __init__(self, team_id: str = "") -> None:
        self.team_id = team_id

    # ── Node upserts ──────────────────────────────────────────────────────────

    def upsert_requirement(self, data: Dict[str, Any]) -> None:
        """Requirement node — from requirements docs or Confluence pages tagged as requirements."""
        run_query(
            """
            MERGE (n:Requirement {id: $id})
            SET n.title            = $title,
                n.description      = $description,
                n.priority         = $priority,
                n.status           = $status,
                n.source           = $source,
                n.doc_id           = $doc_id,
                n.team_id          = $team_id,
                n.updated_at       = timestamp()
            """,
            {
                "id":          data["id"],
                "title":       data.get("title", ""),
                "description": data.get("description", ""),
                "priority":    data.get("priority", "Medium"),
                "status":      data.get("status", ""),
                "source":      data.get("source", "upload"),
                "doc_id":      data.get("doc_id", ""),
                "team_id":     self.team_id,
            },
            write=True,
        )

    def upsert_epic(self, data: Dict[str, Any]) -> None:
        run_query(
            """
            MERGE (n:Epic {id: $id})
            SET n.jira_key    = $jira_key,
                n.title       = $title,
                n.description = $description,
                n.status      = $status,
                n.team_id     = $team_id,
                n.updated_at  = timestamp()
            """,
            {
                "id":          data["id"],
                "jira_key":    data.get("jira_key", data["id"]),
                "title":       data.get("title", ""),
                "description": data.get("description", ""),
                "status":      data.get("status", ""),
                "team_id":     self.team_id,
            },
            write=True,
        )

    def upsert_story(self, data: Dict[str, Any]) -> None:
        run_query(
            """
            MERGE (n:Story {id: $id})
            SET n.jira_key     = $jira_key,
                n.title        = $title,
                n.description  = $description,
                n.status       = $status,
                n.priority     = $priority,
                n.story_points = $story_points,
                n.assignee     = $assignee,
                n.reporter     = $reporter,
                n.created      = $created,
                n.updated      = $updated,
                n.team_id      = $team_id,
                n.updated_at   = timestamp()
            """,
            {
                "id":           data["id"],
                "jira_key":     data.get("jira_key", data["id"]),
                "title":        data.get("title", ""),
                "description":  data.get("description", ""),
                "status":       data.get("status", ""),
                "priority":     data.get("priority", "Medium"),
                "story_points": data.get("story_points"),
                "assignee":     data.get("assignee", ""),
                "reporter":     data.get("reporter", ""),
                "created":      data.get("created", ""),
                "updated":      data.get("updated", ""),
                "team_id":      self.team_id,
            },
            write=True,
        )
        # Wire to Epic
        if data.get("epic_id"):
            run_query(
                """
                MATCH (s:Story {id: $story_id})
                MERGE (e:Epic {id: $epic_id})
                MERGE (s)-[:BELONGS_TO]->(e)
                """,
                {"story_id": data["id"], "epic_id": data["epic_id"]},
                write=True,
            )

    def upsert_bug(self, data: Dict[str, Any]) -> None:
        run_query(
            """
            MERGE (n:Bug {id: $id})
            SET n.jira_key    = $jira_key,
                n.title       = $title,
                n.description = $description,
                n.status      = $status,
                n.severity    = $severity,
                n.assignee    = $assignee,
                n.created     = $created,
                n.updated     = $updated,
                n.team_id     = $team_id,
                n.updated_at  = timestamp()
            """,
            {
                "id":          data["id"],
                "jira_key":    data.get("jira_key", data["id"]),
                "title":       data.get("title", ""),
                "description": data.get("description", ""),
                "status":      data.get("status", ""),
                "severity":    data.get("severity", data.get("priority", "Medium")),
                "assignee":    data.get("assignee", ""),
                "created":     data.get("created", ""),
                "updated":     data.get("updated", ""),
                "team_id":     self.team_id,
            },
            write=True,
        )
        # Wire Bug→Story (affects)
        for sid in data.get("affects_story_ids", []):
            run_query(
                "MATCH (b:Bug {id: $bug_id}) MATCH (s:Story {id: $story_id}) MERGE (b)-[:AFFECTS]->(s)",
                {"bug_id": data["id"], "story_id": sid},
                write=True,
            )

    def upsert_test_case(self, data: Dict[str, Any]) -> None:
        run_query(
            """
            MERGE (n:TestCase {id: $id})
            SET n.title              = $title,
                n.description        = $description,
                n.automation_status  = $automation_status,
                n.priority           = $priority,
                n.doc_id             = $doc_id,
                n.filename           = $filename,
                n.team_id            = $team_id,
                n.updated_at         = timestamp()
            """,
            {
                "id":               data["id"],
                "title":            data.get("title", ""),
                "description":      data.get("description", ""),
                "automation_status": data.get("automation_status", "Manual"),
                "priority":         data.get("priority", "Medium"),
                "doc_id":           data.get("doc_id", ""),
                "filename":         data.get("filename", ""),
                "team_id":          self.team_id,
            },
            write=True,
        )
        # Wire TestCase→Story (covers)
        for sid in data.get("covers_story_ids", []):
            run_query(
                "MATCH (t:TestCase {id: $tc_id}) MATCH (s:Story {id: $story_id}) MERGE (t)-[:COVERS]->(s)",
                {"tc_id": data["id"], "story_id": sid},
                write=True,
            )
        # Wire TestCase→Requirement (covers)
        for rid in data.get("covers_requirement_ids", []):
            run_query(
                "MATCH (t:TestCase {id: $tc_id}) MATCH (r:Requirement {id: $req_id}) MERGE (t)-[:COVERS]->(r)",
                {"tc_id": data["id"], "req_id": rid},
                write=True,
            )

    def upsert_feature(self, data: Dict[str, Any]) -> None:
        feat_id = data.get("id") or _slug(data.get("name", "unknown"))
        run_query(
            """
            MERGE (n:Feature {id: $id})
            SET n.name        = $name,
                n.description = $description,
                n.module      = $module,
                n.team_id     = $team_id,
                n.updated_at  = timestamp()
            """,
            {
                "id":          feat_id,
                "name":        data.get("name", ""),
                "description": data.get("description", ""),
                "module":      data.get("module", ""),
                "team_id":     self.team_id,
            },
            write=True,
        )
        if data.get("module"):
            mod_id = _slug(data["module"])
            self.upsert_module({"id": mod_id, "name": data["module"]})
            run_query(
                "MATCH (f:Feature {id: $fid}) MATCH (m:Module {id: $mid}) MERGE (f)-[:BELONGS_TO]->(m)",
                {"fid": feat_id, "mid": mod_id},
                write=True,
            )

    def upsert_module(self, data: Dict[str, Any]) -> None:
        mod_id = data.get("id") or _slug(data.get("name", "unknown"))
        run_query(
            """
            MERGE (n:Module {id: $id})
            SET n.name        = $name,
                n.description = $description,
                n.team_id     = $team_id,
                n.updated_at  = timestamp()
            """,
            {
                "id":          mod_id,
                "name":        data.get("name", mod_id),
                "description": data.get("description", ""),
                "team_id":     self.team_id,
            },
            write=True,
        )

    def upsert_release(self, data: Dict[str, Any]) -> None:
        run_query(
            """
            MERGE (n:Release {id: $id})
            SET n.version      = $version,
                n.release_date = $release_date,
                n.status       = $status,
                n.team_id      = $team_id,
                n.updated_at   = timestamp()
            """,
            {
                "id":           data["id"],
                "version":      data.get("version", data["id"]),
                "release_date": data.get("release_date", ""),
                "status":       data.get("status", ""),
                "team_id":      self.team_id,
            },
            write=True,
        )

    def upsert_api_endpoint(self, data: Dict[str, Any]) -> None:
        ep_id = data.get("id") or f"{data.get('method', 'GET')}:{data.get('path', '/')}"
        run_query(
            """
            MERGE (n:APIEndpoint {id: $id})
            SET n.method      = $method,
                n.path        = $path,
                n.description = $description,
                n.module      = $module,
                n.team_id     = $team_id,
                n.updated_at  = timestamp()
            """,
            {
                "id":          ep_id,
                "method":      data.get("method", "GET"),
                "path":        data.get("path", ""),
                "description": data.get("description", ""),
                "module":      data.get("module", ""),
                "team_id":     self.team_id,
            },
            write=True,
        )
        if data.get("module"):
            mod_id = _slug(data["module"])
            self.upsert_module({"id": mod_id, "name": data["module"]})
            run_query(
                "MATCH (a:APIEndpoint {id: $aid}) MATCH (m:Module {id: $mid}) MERGE (a)-[:BELONGS_TO]->(m)",
                {"aid": ep_id, "mid": mod_id},
                write=True,
            )

    def upsert_pipeline_run(self, data: Dict[str, Any]) -> None:
        """
        PipelineRun node — from GitHub Actions or GitLab CI.

        Relationships created automatically:
          (:PipelineRun)-[:RAN_ON_BRANCH]->(:Story {branch matches})  (when branch story found)
          (:PipelineRun)-[:VALIDATES_RELEASE]->(:Release)              (when release_id provided)
        """
        run_query(
            """
            MERGE (n:PipelineRun {id: $id})
            SET n.run_id       = $run_id,
                n.name         = $name,
                n.branch       = $branch,
                n.commit_sha   = $commit_sha,
                n.status       = $status,
                n.conclusion   = $conclusion,
                n.started_at   = $started_at,
                n.completed_at = $completed_at,
                n.duration_sec = $duration_sec,
                n.html_url     = $html_url,
                n.ci_system    = $ci_system,
                n.repo         = $repo,
                n.team_id      = $team_id,
                n.updated_at   = timestamp()
            """,
            {
                "id":           data["id"],
                "run_id":       data.get("run_id", ""),
                "name":         data.get("name", ""),
                "branch":       data.get("branch", ""),
                "commit_sha":   data.get("commit_sha", ""),
                "status":       data.get("status", ""),
                "conclusion":   data.get("conclusion", ""),
                "started_at":   data.get("started_at", ""),
                "completed_at": data.get("completed_at", ""),
                "duration_sec": int(data.get("duration_sec", 0)),
                "html_url":     data.get("html_url", ""),
                "ci_system":    data.get("ci_system", ""),
                "repo":         data.get("repo", ""),
                "team_id":      self.team_id,
            },
            write=True,
        )
        # Wire to Release if provided
        if data.get("release_id"):
            run_query(
                """
                MATCH (p:PipelineRun {id: $pid})
                MERGE (r:Release {id: $rid})
                MERGE (p)-[:VALIDATES_RELEASE]->(r)
                """,
                {"pid": data["id"], "rid": data["release_id"]},
                write=True,
            )

    # ── Relationship helpers ───────────────────────────────────────────────────

    def link_story_to_release(self, story_id: str, release_id: str) -> None:
        run_query(
            "MATCH (s:Story {id: $sid}) MATCH (r:Release {id: $rid}) MERGE (s)-[:TARGETS]->(r)",
            {"sid": story_id, "rid": release_id},
            write=True,
        )

    def link_story_to_requirement(self, story_id: str, req_id: str) -> None:
        run_query(
            "MATCH (s:Story {id: $sid}) MATCH (r:Requirement {id: $rid}) MERGE (s)-[:IMPLEMENTS]->(r)",
            {"sid": story_id, "rid": req_id},
            write=True,
        )

    def link_bug_to_release(self, bug_id: str, release_id: str) -> None:
        run_query(
            "MATCH (b:Bug {id: $bid}) MATCH (r:Release {id: $rid}) MERGE (b)-[:FIXED_IN]->(r)",
            {"bid": bug_id, "rid": release_id},
            write=True,
        )

    def link_bug_found_in_test(self, bug_id: str, tc_id: str) -> None:
        run_query(
            "MATCH (b:Bug {id: $bid}) MATCH (t:TestCase {id: $tid}) MERGE (b)-[:FOUND_IN]->(t)",
            {"bid": bug_id, "tid": tc_id},
            write=True,
        )

    # ── Jira batch populate ───────────────────────────────────────────────────

    def populate_from_jira_issue(self, issue: Any) -> None:
        """
        Accept a JiraIssue dataclass and upsert the correct node type + relationships.
        """
        itype = issue.issue_type.lower()

        base = {
            "id":          issue.key,
            "jira_key":    issue.key,
            "title":       issue.summary,
            "description": issue.description,
            "status":      issue.status,
            "priority":    issue.priority,
            "assignee":    issue.assignee or "",
            "reporter":    issue.reporter or "",
            "created":     issue.created,
            "updated":     issue.updated,
        }

        if itype == "epic":
            self.upsert_epic(base)

        elif itype in ("story", "task", "sub-task", "subtask"):
            story_data = {**base, "story_points": issue.story_points}
            if issue.parent_key:
                story_data["epic_id"] = issue.parent_key
            self.upsert_story(story_data)
            # Wire fix versions → Release nodes
            for fv in issue.raw_fields.get("fixVersions", []):
                rel_id = fv.get("name", "")
                if rel_id:
                    self.upsert_release({"id": rel_id, "version": rel_id,
                                         "release_date": fv.get("releaseDate", "")})
                    self.link_story_to_release(issue.key, rel_id)

        elif itype == "bug":
            bug_data = {**base, "severity": issue.priority}
            self.upsert_bug(bug_data)
            if issue.parent_key:
                bug_data["affects_story_ids"] = [issue.parent_key]
            # Wire fix versions → Release
            for fv in issue.raw_fields.get("fixVersions", []):
                rel_id = fv.get("name", "")
                if rel_id:
                    self.upsert_release({"id": rel_id, "version": rel_id,
                                         "release_date": fv.get("releaseDate", "")})
                    self.link_bug_to_release(issue.key, rel_id)

        else:
            # Treat requirements / improvement / feature tickets as Stories
            self.upsert_story({**base, "story_points": issue.story_points,
                                "epic_id": issue.parent_key})
