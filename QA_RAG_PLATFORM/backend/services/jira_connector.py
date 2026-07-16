"""
Jira REST API v3 connector.

Fetches issues, stories, epics, and bugs from Jira Cloud and converts them
into plain text documents suitable for RAG ingestion.

Authentication: Basic auth with email + API token (Atlassian Cloud).
  Token: https://id.atlassian.com/manage-profile/security/api-tokens

Rate limiting: Jira Cloud allows 200 requests/minute for basic auth.
We use a 50ms sleep between pages (conservative; tunable via JIRA_PAGE_DELAY_MS).
"""
from __future__ import annotations

import base64
import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, List, Optional

logger = logging.getLogger(__name__)

DEFAULT_FIELDS = (
    "summary,description,issuetype,status,priority,labels,"
    "assignee,reporter,created,updated,parent,subtasks,"
    "customfield_10014,customfield_10016"  # epic link, story points
)
MAX_RESULTS_PER_PAGE = 100
DEFAULT_PAGE_DELAY_S = 0.05


@dataclass
class JiraIssue:
    key: str
    issue_type: str
    summary: str
    description: str
    status: str
    priority: str
    labels: List[str]
    assignee: Optional[str]
    reporter: Optional[str]
    created: str
    updated: str
    parent_key: Optional[str] = None
    story_points: Optional[float] = None
    raw_fields: Dict[str, Any] = field(default_factory=dict)

    def to_text(self) -> str:
        """Convert to plain text suitable for embedding."""
        parts = [
            f"JIRA ISSUE: {self.key}",
            f"Type: {self.issue_type}",
            f"Summary: {self.summary}",
            f"Status: {self.status}",
            f"Priority: {self.priority}",
        ]
        if self.assignee:
            parts.append(f"Assignee: {self.assignee}")
        if self.reporter:
            parts.append(f"Reporter: {self.reporter}")
        if self.labels:
            parts.append(f"Labels: {', '.join(self.labels)}")
        if self.parent_key:
            parts.append(f"Parent: {self.parent_key}")
        if self.story_points is not None:
            parts.append(f"Story Points: {self.story_points}")
        parts.append(f"Created: {self.created}")
        parts.append(f"Updated: {self.updated}")
        if self.description:
            parts.append(f"\nDescription:\n{self.description}")
        return "\n".join(parts)

    def to_metadata(self, connector_id: str, team_id: Optional[str]) -> Dict[str, Any]:
        return {
            "source": "jira",
            "connector_type": "jira",
            "connector_id": connector_id,
            "jira_key": self.key,
            "issue_type": self.issue_type,
            "status": self.status,
            "priority": self.priority,
            "filename": f"JIRA_{self.key}.txt",
            "document_type": self.issue_type.lower(),
            "team_id": team_id or "",
            "created_at": self.created,
            "updated_at": self.updated,
        }


class JiraConnector:
    """
    Jira Cloud REST API v3 client.

    Usage:
        conn = JiraConnector("https://myorg.atlassian.net", "user@example.com", "ATATT3x...")
        for issue in conn.iter_issues(["PROJ", "QA"], jql_extra="issuetype in (Story, Bug)"):
            text = issue.to_text()
    """

    def __init__(
        self,
        base_url: str,
        email: str,
        api_token: str,
        page_delay_s: float = DEFAULT_PAGE_DELAY_S,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._auth = self._make_basic_auth(email, api_token)
        self.page_delay_s = page_delay_s

    @staticmethod
    def _make_basic_auth(email: str, api_token: str) -> str:
        creds = f"{email}:{api_token}"
        encoded = base64.b64encode(creds.encode()).decode()
        return f"Basic {encoded}"

    def _get(self, path: str, params: Optional[Dict] = None) -> Any:
        url = f"{self.base_url}/rest/api/3{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={
            "Authorization": self._auth,
            "Accept": "application/json",
            "Content-Type": "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            raise RuntimeError(f"Jira API {e.code} on {path}: {body[:300]}") from e

    def test_connection(self) -> Dict[str, str]:
        """Verify credentials and return account info."""
        data = self._get("/myself")
        return {
            "account_id": data.get("accountId", ""),
            "display_name": data.get("displayName", ""),
            "email": data.get("emailAddress", ""),
        }

    def list_projects(self) -> List[Dict[str, str]]:
        data = self._get("/project/search", {"maxResults": "200"})
        return [
            {"key": p["key"], "name": p["name"], "id": p["id"]}
            for p in data.get("values", [])
        ]

    def iter_issues(
        self,
        project_keys: List[str],
        jql_extra: str = "",
        fields: str = DEFAULT_FIELDS,
    ) -> Iterator[JiraIssue]:
        """Yield JiraIssue objects for all issues in the given projects."""
        project_jql = f"project in ({', '.join(project_keys)})"
        jql = f"{project_jql} ORDER BY updated DESC"
        if jql_extra:
            jql = f"{project_jql} AND ({jql_extra}) ORDER BY updated DESC"

        start = 0
        while True:
            data = self._get("/search/jql", {
                "jql": jql,
                "startAt": start,
                "maxResults": MAX_RESULTS_PER_PAGE,
                "fields": fields,
            })
            issues = data.get("issues", [])
            if not issues:
                break

            for raw in issues:
                issue = _parse_issue(raw)
                if issue:
                    yield issue

            total = data.get("total", 0)
            start += len(issues)
            if start >= total:
                break
            time.sleep(self.page_delay_s)

    def get_issue(self, issue_key: str) -> Optional[JiraIssue]:
        try:
            raw = self._get(f"/issue/{issue_key}", {"fields": DEFAULT_FIELDS})
            return _parse_issue(raw)
        except RuntimeError:
            return None


def _parse_issue(raw: Dict[str, Any]) -> Optional[JiraIssue]:
    """Convert raw Jira API response to JiraIssue."""
    try:
        f = raw.get("fields", {})

        def _text(adf_or_str) -> str:
            """Extract plain text from Atlassian Document Format or plain string."""
            if not adf_or_str:
                return ""
            if isinstance(adf_or_str, str):
                return adf_or_str
            return _adf_to_text(adf_or_str)

        return JiraIssue(
            key=raw["key"],
            issue_type=f.get("issuetype", {}).get("name", "Issue"),
            summary=f.get("summary", ""),
            description=_text(f.get("description")),
            status=f.get("status", {}).get("name", ""),
            priority=f.get("priority", {}).get("name", "Medium") if f.get("priority") else "None",
            labels=f.get("labels", []),
            assignee=f.get("assignee", {}).get("displayName") if f.get("assignee") else None,
            reporter=f.get("reporter", {}).get("displayName") if f.get("reporter") else None,
            created=f.get("created", ""),
            updated=f.get("updated", ""),
            parent_key=f.get("parent", {}).get("key") if f.get("parent") else None,
            story_points=f.get("customfield_10016"),
            raw_fields=f,
        )
    except Exception as exc:
        logger.warning("Failed to parse Jira issue %s: %s", raw.get("key", "?"), exc)
        return None


def _adf_to_text(node: Any, depth: int = 0) -> str:
    """Recursively convert Atlassian Document Format (ADF) to plain text."""
    if not isinstance(node, dict):
        return ""
    node_type = node.get("type", "")
    parts = []

    if node_type == "text":
        return node.get("text", "")
    if node_type == "hardBreak":
        return "\n"
    if node_type in ("mention", "emoji"):
        return node.get("attrs", {}).get("text", "") or node.get("attrs", {}).get("shortName", "")
    if node_type == "inlineCard":
        return node.get("attrs", {}).get("url", "")

    for child in node.get("content", []):
        parts.append(_adf_to_text(child, depth + 1))

    joiner = "\n" if node_type in ("paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "panel") else ""
    result = joiner.join(p for p in parts if p)
    return result + ("\n" if joiner else "")
