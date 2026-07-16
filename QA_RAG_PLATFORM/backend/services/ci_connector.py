"""
CI/CD Pipeline connector — ingests pipeline run data into the Neo4j Knowledge Graph.

Supported CI systems:
  - GitHub Actions  (requires GITHUB_TOKEN or connector.api_token)
  - GitLab CI       (requires GITLAB_TOKEN or connector.api_token)

Usage:
  from backend.services.ci_connector import GitHubActionsConnector, GitLabCIConnector
  conn = GitHubActionsConnector(token="ghp_...", owner="acme", repo="platform")
  for run in conn.iter_pipeline_runs(limit=50):
      print(run.name, run.status, run.conclusion)
"""
from __future__ import annotations

import json
import logging
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, Iterator, List, Optional

logger = logging.getLogger(__name__)


# ── Shared dataclass ──────────────────────────────────────────────────────────

@dataclass
class CIPipelineRun:
    """Normalised CI pipeline run — source-agnostic."""
    run_id:       str
    name:         str
    branch:       str
    commit_sha:   str
    status:       str   # queued | in_progress | completed
    conclusion:   str   # success | failure | cancelled | skipped | ""
    started_at:   str
    completed_at: str
    duration_sec: int
    html_url:     str
    ci_system:    str   # "github_actions" | "gitlab_ci"
    repo:         str
    # Job / stage summary
    jobs:         List[Dict[str, Any]] = field(default_factory=list)

    def to_graph_node(self, team_id: str = "") -> Dict[str, Any]:
        return {
            "id":           f"{self.ci_system}:{self.run_id}",
            "run_id":       self.run_id,
            "name":         self.name,
            "branch":       self.branch,
            "commit_sha":   self.commit_sha,
            "status":       self.status,
            "conclusion":   self.conclusion,
            "started_at":   self.started_at,
            "completed_at": self.completed_at,
            "duration_sec": self.duration_sec,
            "html_url":     self.html_url,
            "ci_system":    self.ci_system,
            "repo":         self.repo,
            "team_id":      team_id,
        }

    def to_text(self) -> str:
        jobs_text = ""
        if self.jobs:
            lines = [
                f"  - {j.get('name', '?')}: {j.get('conclusion', j.get('status', '?'))}"
                for j in self.jobs[:20]
            ]
            jobs_text = "\nJobs:\n" + "\n".join(lines)
        return (
            f"CI Pipeline Run: {self.name}\n"
            f"Repository: {self.repo}\n"
            f"Branch: {self.branch}\n"
            f"Commit: {self.commit_sha[:12]}\n"
            f"Status: {self.status} / {self.conclusion}\n"
            f"Started: {self.started_at}\n"
            f"Duration: {self.duration_sec}s\n"
            f"System: {self.ci_system}"
            + jobs_text
        )


# ── HTTP helper ───────────────────────────────────────────────────────────────

def _get_json(url: str, headers: Dict[str, str]) -> Any:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


# ── GitHub Actions ────────────────────────────────────────────────────────────

class GitHubActionsConnector:
    """Fetch workflow runs from GitHub Actions via the REST API."""

    _API = "https://api.github.com"

    def __init__(self, token: str, owner: str, repo: str) -> None:
        self.owner = owner
        self.repo  = repo
        self._headers = {
            "Authorization": f"Bearer {token}",
            "Accept":        "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def test_connection(self) -> bool:
        try:
            _get_json(f"{self._API}/repos/{self.owner}/{self.repo}", self._headers)
            return True
        except Exception:
            return False

    def iter_pipeline_runs(
        self,
        branch: Optional[str] = None,
        status: Optional[str] = None,   # completed | in_progress | queued
        limit: int = 100,
    ) -> Iterator[CIPipelineRun]:
        """Yield CIPipelineRun objects, newest first."""
        per_page = min(limit, 100)
        url = f"{self._API}/repos/{self.owner}/{self.repo}/actions/runs?per_page={per_page}"
        if branch:
            url += f"&branch={branch}"
        if status:
            url += f"&status={status}"

        fetched = 0
        while url and fetched < limit:
            try:
                data = _get_json(url, self._headers)
            except urllib.error.HTTPError as exc:
                logger.warning("GitHub Actions API error: %s", exc)
                break

            for run in data.get("workflow_runs", []):
                if fetched >= limit:
                    break
                # Parse duration
                started = run.get("run_started_at") or run.get("created_at", "")
                completed = run.get("updated_at", "")
                duration = 0
                try:
                    if started and completed:
                        t0 = datetime.fromisoformat(started.replace("Z", "+00:00"))
                        t1 = datetime.fromisoformat(completed.replace("Z", "+00:00"))
                        duration = max(0, int((t1 - t0).total_seconds()))
                except Exception:
                    pass

                yield CIPipelineRun(
                    run_id       = str(run["id"]),
                    name         = run.get("name", ""),
                    branch       = run.get("head_branch", ""),
                    commit_sha   = run.get("head_sha", ""),
                    status       = run.get("status", ""),
                    conclusion   = run.get("conclusion") or "",
                    started_at   = started,
                    completed_at = completed,
                    duration_sec = duration,
                    html_url     = run.get("html_url", ""),
                    ci_system    = "github_actions",
                    repo         = f"{self.owner}/{self.repo}",
                )
                fetched += 1

            # Pagination via Link header is not available with urllib; check next page manually
            url = data.get("next") or ""   # GitHub doesn't embed next in JSON; stop here
            # (Pagination would require parsing Link headers — sufficient for typical batch sizes)
            break

    def get_jobs(self, run_id: str) -> List[Dict[str, Any]]:
        """Return list of jobs for a specific run."""
        try:
            url = f"{self._API}/repos/{self.owner}/{self.repo}/actions/runs/{run_id}/jobs"
            data = _get_json(url, self._headers)
            return [
                {
                    "name":       j.get("name", ""),
                    "status":     j.get("status", ""),
                    "conclusion": j.get("conclusion") or "",
                    "started_at": j.get("started_at", ""),
                }
                for j in data.get("jobs", [])
            ]
        except Exception as exc:
            logger.debug("GitHub get_jobs(%s) failed: %s", run_id, exc)
            return []


# ── GitLab CI ─────────────────────────────────────────────────────────────────

class GitLabCIConnector:
    """Fetch pipeline runs from GitLab CI via the REST API."""

    def __init__(self, base_url: str, token: str, project_id: str) -> None:
        self.base_url   = base_url.rstrip("/")
        self.project_id = project_id
        self._headers   = {"PRIVATE-TOKEN": token}

    def test_connection(self) -> bool:
        try:
            _get_json(
                f"{self.base_url}/api/v4/projects/{self.project_id}",
                self._headers,
            )
            return True
        except Exception:
            return False

    def iter_pipeline_runs(
        self,
        ref: Optional[str] = None,
        status: Optional[str] = None,   # running | pending | success | failed | canceled
        limit: int = 100,
    ) -> Iterator[CIPipelineRun]:
        per_page = min(limit, 100)
        url = (
            f"{self.base_url}/api/v4/projects/{self.project_id}/pipelines"
            f"?per_page={per_page}&order_by=id&sort=desc"
        )
        if ref:
            url += f"&ref={ref}"
        if status:
            url += f"&status={status}"

        fetched = 0
        try:
            pipelines = _get_json(url, self._headers)
        except Exception as exc:
            logger.warning("GitLab API error: %s", exc)
            return

        for pl in pipelines:
            if fetched >= limit:
                break
            # Fetch detailed pipeline for duration
            try:
                detail_url = (
                    f"{self.base_url}/api/v4/projects/{self.project_id}/pipelines/{pl['id']}"
                )
                detail = _get_json(detail_url, self._headers)
            except Exception:
                detail = pl

            duration = detail.get("duration") or 0
            yield CIPipelineRun(
                run_id       = str(pl["id"]),
                name         = detail.get("name") or f"Pipeline #{pl['id']}",
                branch       = detail.get("ref", ""),
                commit_sha   = detail.get("sha", ""),
                status       = detail.get("status", ""),
                conclusion   = "success" if detail.get("status") == "success"
                               else ("failure" if detail.get("status") in ("failed",) else ""),
                started_at   = detail.get("started_at") or detail.get("created_at", ""),
                completed_at = detail.get("finished_at") or "",
                duration_sec = int(duration) if duration else 0,
                html_url     = detail.get("web_url", ""),
                ci_system    = "gitlab_ci",
                repo         = str(self.project_id),
            )
            fetched += 1

    def get_jobs(self, pipeline_id: str) -> List[Dict[str, Any]]:
        try:
            url = (
                f"{self.base_url}/api/v4/projects/{self.project_id}"
                f"/pipelines/{pipeline_id}/jobs"
            )
            jobs = _get_json(url, self._headers)
            return [
                {
                    "name":       j.get("name", ""),
                    "status":     j.get("status", ""),
                    "conclusion": "success" if j.get("status") == "success" else j.get("status", ""),
                    "started_at": j.get("started_at", ""),
                }
                for j in jobs
            ]
        except Exception as exc:
            logger.debug("GitLab get_jobs(%s) failed: %s", pipeline_id, exc)
            return []
