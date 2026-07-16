"""
TestRail REST API v2 connector.

Fetches projects, suites, test cases, test plans, and test runs
from TestRail and converts them into plain-text documents for RAG ingestion.

Auth: Basic auth — email:api_key (API key generated in TestRail My Settings)
URL:  https://yourorg.testrail.io/index.php?/api/v2/...

TestRail rate limits: 180 requests/minute on Cloud plans.
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

DEFAULT_PAGE_DELAY_S = 0.1
MAX_PER_PAGE = 250


@dataclass
class TestRailCase:
    case_id: int
    title: str
    section_id: Optional[int]
    suite_id: Optional[int]
    priority: str
    case_type: str
    refs: str
    custom_steps: str
    custom_expected: str
    project_id: int
    project_name: str
    suite_name: str

    def to_text(self) -> str:
        parts = [
            f"TESTRAIL TEST CASE: {self.case_id}",
            f"Project: {self.project_name}",
            f"Suite: {self.suite_name}",
            f"Title: {self.title}",
            f"Priority: {self.priority}",
            f"Type: {self.case_type}",
        ]
        if self.refs:
            parts.append(f"References: {self.refs}")
        if self.custom_steps:
            parts.append(f"\nSteps:\n{self.custom_steps}")
        if self.custom_expected:
            parts.append(f"\nExpected Result:\n{self.custom_expected}")
        return "\n".join(parts)

    def to_metadata(self, connector_id: str, team_id: Optional[str]) -> Dict[str, Any]:
        return {
            "source":          "testrail",
            "connector_type":  "testrail",
            "connector_id":    connector_id,
            "case_id":         str(self.case_id),
            "suite_id":        str(self.suite_id or ""),
            "project_id":      str(self.project_id),
            "filename":        f"TESTRAIL_C{self.case_id}.txt",
            "document_type":   "test_cases",
            "priority":        self.priority,
            "team_id":         team_id or "",
        }


class TestRailConnector:
    """
    TestRail Cloud + Server API v2 client.

    Usage:
        conn = TestRailConnector("https://org.testrail.io", "me@org.com", "api_key_here")
        for case in conn.iter_cases(project_ids=[1, 2]):
            print(case.to_text())
    """

    def __init__(
        self,
        base_url: str,
        email: str,
        api_key: str,
        page_delay_s: float = DEFAULT_PAGE_DELAY_S,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._auth = "Basic " + base64.b64encode(f"{email}:{api_key}".encode()).decode()
        self.page_delay_s = page_delay_s

    def _get(self, endpoint: str, params: Optional[Dict] = None) -> Any:
        url = f"{self.base_url}/index.php?/api/v2/{endpoint}"
        if params:
            url += "&" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={
            "Authorization": self._auth,
            "Content-Type":  "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            raise RuntimeError(f"TestRail API {e.code} on {endpoint}: {body[:300]}") from e

    def test_connection(self) -> Dict[str, str]:
        data = self._get("get_current_user")
        return {
            "id":    str(data.get("id", "")),
            "name":  data.get("name", ""),
            "email": data.get("email", ""),
        }

    def list_projects(self) -> List[Dict[str, Any]]:
        data = self._get("get_projects")
        projects = data if isinstance(data, list) else data.get("projects", [])
        return [{"id": p["id"], "name": p["name"], "suite_mode": p.get("suite_mode", 1)} for p in projects]

    def list_suites(self, project_id: int) -> List[Dict[str, Any]]:
        try:
            data = self._get(f"get_suites/{project_id}")
            return [{"id": s["id"], "name": s["name"]} for s in (data if isinstance(data, list) else [])]
        except RuntimeError:
            return [{"id": None, "name": "Default"}]

    def iter_cases(
        self,
        project_ids: Optional[List[int]] = None,
    ) -> Iterator[TestRailCase]:
        """Yield TestRailCase for all cases in the specified projects (or all projects)."""
        if project_ids is None:
            project_ids = [p["id"] for p in self.list_projects()]

        # Load priority + type maps once
        try:
            priorities = {p["id"]: p["name"] for p in self._get("get_priorities")}
        except Exception:
            priorities = {}
        try:
            case_types = {t["id"]: t["name"] for t in self._get("get_case_types")}
        except Exception:
            case_types = {}

        for pid in project_ids:
            project_name = str(pid)
            suites = self.list_suites(pid)
            for suite in suites:
                suite_id = suite.get("id")
                suite_name = suite["name"]
                offset = 0
                while True:
                    params: Dict[str, Any] = {"limit": MAX_PER_PAGE, "offset": offset}
                    if suite_id:
                        params["suite_id"] = suite_id
                    try:
                        result = self._get(f"get_cases/{pid}", params)
                    except RuntimeError as exc:
                        logger.warning("TestRail get_cases failed for project %d: %s", pid, exc)
                        break
                    cases = result if isinstance(result, list) else result.get("cases", [])
                    if not cases:
                        break
                    for c in cases:
                        steps = _extract_steps(c)
                        yield TestRailCase(
                            case_id=c["id"],
                            title=c.get("title", ""),
                            section_id=c.get("section_id"),
                            suite_id=suite_id,
                            priority=priorities.get(c.get("priority_id", 0), "Medium"),
                            case_type=case_types.get(c.get("type_id", 0), "Functional"),
                            refs=c.get("refs", "") or "",
                            custom_steps=steps["steps"],
                            custom_expected=steps["expected"],
                            project_id=pid,
                            project_name=project_name,
                            suite_name=suite_name,
                        )
                    if len(cases) < MAX_PER_PAGE:
                        break
                    offset += len(cases)
                    time.sleep(self.page_delay_s)


def _extract_steps(case: Dict[str, Any]) -> Dict[str, str]:
    """Extract test steps from various TestRail custom field formats."""
    # Structured steps (array of step objects)
    steps_sep = case.get("custom_steps_separated")
    if isinstance(steps_sep, list):
        steps = "\n".join(
            f"{i+1}. {s.get('content', '')}" for i, s in enumerate(steps_sep)
        )
        expected = "\n".join(
            f"{i+1}. {s.get('expected', '')}" for i, s in enumerate(steps_sep) if s.get("expected")
        )
        return {"steps": steps, "expected": expected}
    # Plain text steps
    return {
        "steps":    str(case.get("custom_steps", "") or ""),
        "expected": str(case.get("custom_expected", "") or ""),
    }
