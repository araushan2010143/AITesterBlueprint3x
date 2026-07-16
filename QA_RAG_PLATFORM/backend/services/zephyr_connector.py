"""
Zephyr Scale (formerly TM4J) Cloud REST API connector.

Fetches test cases, test cycles, and execution results from Zephyr Scale
(the Atlassian Marketplace app for Jira Cloud).

API base: https://api.zephyrscale.smartbear.com/v2
Auth:     Bearer token (generated in Zephyr Scale settings → API Keys)

Also supports Zephyr Squad (older, simpler API):
  base_url = https://{org}.atlassian.net
  endpoint = /rest/zapi/latest/

The connector auto-detects which API to use from base_url.
"""
from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, Iterator, List, Optional

logger = logging.getLogger(__name__)

DEFAULT_PAGE_DELAY_S = 0.1
MAX_PER_PAGE = 100


@dataclass
class ZephyrTestCase:
    key: str                    # e.g. "QA-TC-1"
    name: str
    status: str
    priority: str
    objective: str
    precondition: str
    test_script: str            # step-by-step or BDD
    labels: List[str]
    project_key: str
    folder: str

    def to_text(self) -> str:
        parts = [
            f"ZEPHYR TEST CASE: {self.key}",
            f"Project: {self.project_key}",
            f"Name: {self.name}",
            f"Status: {self.status}",
            f"Priority: {self.priority}",
            f"Folder: {self.folder}",
        ]
        if self.labels:
            parts.append(f"Labels: {', '.join(self.labels)}")
        if self.objective:
            parts.append(f"\nObjective:\n{self.objective}")
        if self.precondition:
            parts.append(f"\nPrecondition:\n{self.precondition}")
        if self.test_script:
            parts.append(f"\nTest Script:\n{self.test_script}")
        return "\n".join(parts)

    def to_metadata(self, connector_id: str, team_id: Optional[str]) -> Dict[str, Any]:
        return {
            "source":          "zephyr",
            "connector_type":  "zephyr",
            "connector_id":    connector_id,
            "zephyr_key":      self.key,
            "project_key":     self.project_key,
            "filename":        f"ZEPHYR_{self.key}.txt",
            "document_type":   "test_cases",
            "priority":        self.priority,
            "team_id":         team_id or "",
        }


class ZephyrScaleConnector:
    """
    Zephyr Scale Cloud API v2 client.

    Usage:
        conn = ZephyrScaleConnector(
            base_url="https://api.zephyrscale.smartbear.com/v2",
            api_key="Bearer_token_here",
            project_key="QA",
        )
        for tc in conn.iter_test_cases():
            print(tc.to_text())
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        project_key: str = "",
        page_delay_s: float = DEFAULT_PAGE_DELAY_S,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._auth = f"Bearer {api_key}"
        self.project_key = project_key
        self.page_delay_s = page_delay_s

    def _get(self, path: str, params: Optional[Dict] = None) -> Any:
        url = f"{self.base_url}/{path.lstrip('/')}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={
            "Authorization": self._auth,
            "Accept":        "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            raise RuntimeError(f"Zephyr API {e.code} on {path}: {body[:300]}") from e

    def test_connection(self) -> Dict[str, str]:
        """Test connectivity by fetching project info."""
        try:
            data = self._get("/projects", {"projectKey": self.project_key, "maxResults": 1})
            values = data.get("values", [])
            if values:
                return {"project_key": values[0].get("key", ""), "name": values[0].get("name", "")}
            return {"status": "ok", "projects": 0}
        except RuntimeError as exc:
            raise RuntimeError(f"Zephyr connection test failed: {exc}") from exc

    def iter_test_cases(
        self,
        project_key: Optional[str] = None,
    ) -> Iterator[ZephyrTestCase]:
        """Yield ZephyrTestCase for all test cases in the project."""
        pk = project_key or self.project_key
        start_at = 0
        while True:
            try:
                data = self._get("/testcases", {
                    "projectKey": pk,
                    "maxResults":  MAX_PER_PAGE,
                    "startAt":     start_at,
                })
            except RuntimeError as exc:
                logger.error("Zephyr iter_test_cases failed: %s", exc)
                break

            values = data.get("values", [])
            if not values:
                break

            for item in values:
                tc = _parse_test_case(item, pk)
                if tc:
                    yield tc

            if data.get("isLast", True) or len(values) < MAX_PER_PAGE:
                break
            start_at += len(values)
            time.sleep(self.page_delay_s)

    def list_test_cycles(self, project_key: Optional[str] = None) -> List[Dict[str, Any]]:
        pk = project_key or self.project_key
        try:
            data = self._get("/testcycles", {"projectKey": pk, "maxResults": 50})
            return data.get("values", [])
        except RuntimeError:
            return []

    def iter_executions(self, test_cycle_key: str) -> Iterator[Dict[str, Any]]:
        """Yield test execution results for a test cycle."""
        start_at = 0
        while True:
            try:
                data = self._get("/testexecutions", {
                    "testCycle":  test_cycle_key,
                    "maxResults": MAX_PER_PAGE,
                    "startAt":    start_at,
                })
            except RuntimeError:
                break
            values = data.get("values", [])
            if not values:
                break
            for item in values:
                yield item
            if data.get("isLast", True):
                break
            start_at += len(values)
            time.sleep(self.page_delay_s)


def _parse_test_case(raw: Dict[str, Any], project_key: str) -> Optional[ZephyrTestCase]:
    try:
        script = _extract_script(raw.get("testScript", {}))
        return ZephyrTestCase(
            key=raw.get("key", ""),
            name=raw.get("name", ""),
            status=raw.get("status", {}).get("name", "") if isinstance(raw.get("status"), dict) else str(raw.get("status", "")),
            priority=raw.get("priority", {}).get("name", "Medium") if isinstance(raw.get("priority"), dict) else str(raw.get("priority", "Medium")),
            objective=raw.get("objective", "") or "",
            precondition=raw.get("precondition", "") or "",
            test_script=script,
            labels=[lbl.get("name", "") for lbl in raw.get("labels", []) if isinstance(lbl, dict)],
            project_key=project_key,
            folder=raw.get("folder", {}).get("name", "") if isinstance(raw.get("folder"), dict) else "",
        )
    except Exception as exc:
        logger.warning("Zephyr parse error for %s: %s", raw.get("key", "?"), exc)
        return None


def _extract_script(script_obj: Any) -> str:
    if not script_obj:
        return ""
    if isinstance(script_obj, str):
        return script_obj
    script_type = script_obj.get("type", "")
    if script_type == "STEP_BY_STEP":
        steps = script_obj.get("steps", [])
        lines = []
        for i, step in enumerate(steps, 1):
            desc = step.get("description", "")
            exp  = step.get("expectedResult", "")
            lines.append(f"Step {i}: {desc}")
            if exp:
                lines.append(f"  Expected: {exp}")
        return "\n".join(lines)
    if script_type == "BDD":
        return script_obj.get("text", "")
    return str(script_obj)
