import re
import sqlite3
import json
from datetime import datetime

from langflow.custom import Component
from langflow.inputs import MessageTextInput
from langflow.schema.message import Message
from langflow.template import Output


class RootCauseAnalyzer(Component):
    display_name = "Root Cause Analyzer v3.1"
    description = (
        "Parses failed endpoints from the enriched summary, classifies root causes, "
        "detects regressions via SQLite history, and outputs a structured analysis for the LLM."
    )
    icon = "AlertTriangle"

    inputs = [
        MessageTextInput(
            name="enriched_summary",
            display_name="Enriched Summary",
            info="Wire from Historical Dashboard v3.0 output.",
        ),
        MessageTextInput(
            name="db_path",
            display_name="Database Path",
            value="reports/history.db",
            info="Same SQLite DB used by Historical Dashboard v3.0.",
        ),
        MessageTextInput(
            name="known_fixes",
            display_name="Known Fix Patterns (JSON)",
            value="{}",
            info='Optional map of regex → fix hint. e.g. {"401": "Regenerate auth token before this call"}',
        ),
    ]

    outputs = [Output(display_name="RCA Report", name="rca_report", method="analyze")]

    # ── severity by category ───────────────────────────────────────────────────
    _SEVERITY_RANK = {
        "connectivity": 4,
        "status_5xx": 4,
        "status_4xx": 3,
        "schema_missing": 3,
        "schema_type": 2,
        "assertion": 2,
        "sla": 1,
        "unknown": 1,
    }
    _SEVERITY_LABEL = {4: "CRITICAL", 3: "HIGH", 2: "MEDIUM", 1: "LOW"}

    # ── fix suggestions per category ───────────────────────────────────────────
    _FIXES = {
        "connectivity": [
            "Verify the base URL is reachable (ping / curl the host directly).",
            "Check if a VPN or firewall is blocking the connection from the test runner.",
            "Confirm the service is deployed and healthy (check k8s pods / docker status).",
            "Review network timeout settings — increase if the host is geographically distant.",
        ],
        "status_401": [
            "Auth token is missing or expired — ensure POST /auth runs BEFORE this endpoint.",
            "Verify the Authorization header format: Bearer <token>, not Basic or raw token.",
            "Check token TTL — if it expires in < 30 s, add a refresh step before the chain.",
        ],
        "status_403": [
            "Token is valid but the user lacks permission for this resource/action.",
            "Verify RBAC roles assigned to the test account in the target environment.",
            "Check if the resource requires an elevated scope (admin vs. read-only).",
        ],
        "status_404": [
            "Path parameter value is wrong — confirm the resource was created in a prior step.",
            "Verify the API version prefix in the URL (e.g. /v1/ vs /v2/).",
            "Resource may have been deleted by a previous test run — add idempotent setup.",
        ],
        "status_429": [
            "Rate limit exceeded — add explicit delays between requests.",
            "Reduce parallel workers in API Test Suite (set to 1 for sequential execution).",
            "Implement exponential backoff (already available in APITestSuite v2.1+).",
        ],
        "status_5xx": [
            "Server-side error — pull application logs immediately after the failure.",
            "Check request body for invalid or boundary-violating values.",
            "Retry after 30 s — may be a transient error (cold start, GC pause).",
            "Escalate to backend team if the 5xx persists across multiple runs.",
        ],
        "schema_missing": [
            "API contract changed — update the required-fields list in your Schemas JSON.",
            "Response may be nested: look one level deeper (e.g. response.data.field).",
            "Field may be conditionally absent — move it to optional if that is by design.",
        ],
        "schema_type": [
            "API is returning a different type than expected — update the type in Schemas JSON.",
            "Check for null being returned instead of the expected type (null-safety issue).",
            "String-vs-number mismatch: confirm if the API quotes numeric values as strings.",
        ],
        "assertion": [
            "Response value is outside the expected range — verify test data is valid.",
            "Business logic may have changed — review the assertion condition.",
            "Check if a prerequisite step (e.g. create booking) populated the field correctly.",
        ],
        "sla": [
            "Response time exceeds SLA threshold — check server load / CPU utilization.",
            "Run the test from a location closer to the server to rule out network latency.",
            "Profile the endpoint for slow DB queries or blocking I/O.",
            "Consider raising the SLA threshold for the QA environment if infra is shared.",
        ],
    }

    # ──────────────────────────────────────────────────────────────────────────
    def analyze(self) -> Message:
        summary = self.enriched_summary
        if hasattr(summary, "text"):
            summary = summary.text

        try:
            known_fixes: dict = json.loads(self.known_fixes) if self.known_fixes.strip() not in ("{}", "") else {}
        except Exception:
            known_fixes = {}

        failures = self._extract_failures(summary)

        if not failures:
            clean = (
                f"{summary}\n\n"
                "=== ROOT CAUSE ANALYSIS ===\n"
                "No failures detected — all endpoints healthy. No root cause analysis required."
            )
            return Message(text=clean)

        analyses = [self._analyze_failure(f, known_fixes) for f in failures]
        report = self._build_report(analyses, summary)
        return Message(text=report)

    # ── parsing ────────────────────────────────────────────────────────────────
    def _extract_failures(self, summary: str) -> list:
        failures = []
        lines = summary.split("\n")

        for i, line in enumerate(lines):
            if "❌" not in line:
                continue

            failure: dict = {"raw": line.strip(), "checks": []}

            m = re.search(r"\b(GET|POST|PUT|PATCH|DELETE|HEAD)\b\s+(/[^\s\-—|]*)", line)
            if m:
                failure["method"] = m.group(1)
                failure["path"] = m.group(2).rstrip(" —|")
            else:
                failure["method"] = "UNKNOWN"
                failure["path"] = line.strip()

            s = re.search(r"\b([1-5]\d{2})\b", line)
            failure["status_code"] = int(s.group(1)) if s else None

            t = re.search(r"(\d+(?:\.\d+)?)\s*ms", line)
            failure["response_ms"] = float(t.group(1)) if t else None

            # collect indented check lines that follow
            for j in range(i + 1, min(i + 8, len(lines))):
                nl = lines[j].strip()
                if not nl:
                    break
                if nl.startswith(("✅", "❌", "PERF", "HIST", "OVER", "FLAW", "---")):
                    break
                if any(k in nl.lower() for k in ("check", "fail", "missing", "expected", "assert", "sla", "type", "required")):
                    failure["checks"].append(nl)

            failures.append(failure)

        return failures

    # ── analysis ───────────────────────────────────────────────────────────────
    def _analyze_failure(self, failure: dict, known_fixes: dict) -> dict:
        method = failure["method"]
        path = failure["path"]
        status = failure["status_code"]
        checks = failure["checks"]
        raw = failure["raw"].lower()

        categories: list[str] = []
        fixes: list[str] = []

        # connectivity
        if any(k in raw for k in ("connection", "timeout", "refused", "unreachable", "network error")):
            categories.append("connectivity")
            fixes += self._FIXES["connectivity"]

        # status code
        if status:
            if status >= 500:
                categories.append("status_5xx")
                fixes += self._FIXES.get(f"status_{status}", self._FIXES["status_5xx"])
            elif status == 401:
                categories.append("status_4xx")
                fixes += self._FIXES["status_401"]
            elif status == 403:
                categories.append("status_4xx")
                fixes += self._FIXES["status_403"]
            elif status == 404:
                categories.append("status_4xx")
                fixes += self._FIXES["status_404"]
            elif status == 429:
                categories.append("status_4xx")
                fixes += self._FIXES["status_429"]
            elif status >= 400:
                categories.append("status_4xx")
                fixes += [f"HTTP {status} received — review API documentation for this error code."]

        # check details
        for c in checks:
            cl = c.lower()
            if "missing" in cl or "required" in cl:
                if "schema_missing" not in categories:
                    categories.append("schema_missing")
                    fixes += self._FIXES["schema_missing"]
            if "type" in cl and ("mismatch" in cl or "expected" in cl):
                if "schema_type" not in categories:
                    categories.append("schema_type")
                    fixes += self._FIXES["schema_type"]
            if ("assertion" in cl or ("failed" in cl and "check" in cl)) and "assertion" not in categories:
                categories.append("assertion")
                fixes += self._FIXES["assertion"]
            if ("sla" in cl or "threshold" in cl) and "sla" not in categories:
                categories.append("sla")
                fixes += self._FIXES["sla"]

        if not categories:
            categories = ["unknown"]

        # apply known-fix overrides
        for pattern, hint in known_fixes.items():
            try:
                if re.search(pattern, f"{method} {path}", re.IGNORECASE):
                    fixes.insert(0, f"[Known Fix] {hint}")
            except re.error:
                pass

        # deduplicate fixes preserving order
        seen: set = set()
        deduped = []
        for f in fixes:
            if f not in seen:
                seen.add(f)
                deduped.append(f)

        # severity = highest ranked category
        rank = max((self._SEVERITY_RANK.get(c, 1) for c in categories), default=1)
        severity = self._SEVERITY_LABEL[rank]

        regression = self._check_regression(method, path)

        return {
            "endpoint": f"{method} {path}",
            "status_code": status,
            "response_ms": failure["response_ms"],
            "severity": severity,
            "categories": categories,
            "checks": checks,
            "fixes": deduped[:5],
            "regression": regression,
        }

    # ── sqlite regression check ────────────────────────────────────────────────
    def _check_regression(self, method: str, path: str) -> dict:
        try:
            conn = sqlite3.connect(self.db_path)
            cur = conn.cursor()
            cur.execute("""
                SELECT er.passed, tr.run_at, tr.environment
                FROM endpoint_results er
                JOIN test_runs tr ON er.run_id = tr.id
                WHERE er.method = ?
                ORDER BY tr.run_at DESC
                LIMIT 10
            """, (method,))
            rows = cur.fetchall()
            conn.close()

            if not rows:
                return {"type": "NO_HISTORY", "detail": "No historical data found for this method — first run or new endpoint."}

            results = [bool(r[0]) for r in rows]
            if len(results) >= 2 and results[1]:
                return {
                    "type": "REGRESSION",
                    "detail": f"Was PASSING in the previous run ({rows[1][1]} [{rows[1][2]}]). A recent change likely introduced this failure.",
                }
            if all(not r for r in results):
                return {
                    "type": "PERSISTENT",
                    "detail": f"Failing across all {len(results)} recent runs. Not a regression — likely a configuration or environment issue.",
                }
            passing = sum(1 for r in results if r)
            return {
                "type": "FLAKY",
                "detail": f"Passed {passing}/{len(results)} recent runs. Intermittent issue — possible race condition or external dependency.",
            }
        except Exception as exc:
            return {"type": "UNKNOWN", "detail": f"Could not query history: {exc}"}

    # ── report formatting ──────────────────────────────────────────────────────
    def _build_report(self, analyses: list, original_summary: str) -> str:
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        sep = "=" * 64

        lines = [
            original_summary,
            "",
            sep,
            f"ROOT CAUSE ANALYSIS — {now}",
            sep,
            f"Total Failures Analyzed: {len(analyses)}",
            "",
        ]

        severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
        sorted_analyses = sorted(analyses, key=lambda a: severity_order.get(a["severity"], 4))

        for i, a in enumerate(sorted_analyses, 1):
            sev_icon = {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🔵"}.get(a["severity"], "⚪")
            lines.append(f"[FAILURE {i}] {sev_icon} {a['endpoint']}")
            lines.append(f"  Severity   : {a['severity']}")
            lines.append(f"  Categories : {', '.join(a['categories'])}")
            if a["status_code"]:
                lines.append(f"  HTTP Status: {a['status_code']}")
            if a["response_ms"] is not None:
                lines.append(f"  Resp Time  : {a['response_ms']}ms")

            reg = a["regression"]
            reg_icon = {"REGRESSION": "🔁", "PERSISTENT": "🔂", "FLAKY": "⚡", "NO_HISTORY": "🆕", "UNKNOWN": "❓"}.get(reg["type"], "❓")
            lines.append(f"  Regression : {reg_icon} [{reg['type']}] {reg['detail']}")

            if a["checks"]:
                lines.append("  Failed Checks:")
                for c in a["checks"]:
                    lines.append(f"    • {c}")

            lines.append("  Fix Suggestions:")
            for j, fix in enumerate(a["fixes"], 1):
                lines.append(f"    {j}. {fix}")

            lines.append("")

        # priority summary block
        critical = [a for a in sorted_analyses if a["severity"] == "CRITICAL"]
        high = [a for a in sorted_analyses if a["severity"] == "HIGH"]
        regressions = [a for a in sorted_analyses if a["regression"]["type"] == "REGRESSION"]

        lines.append("PRIORITY SUMMARY:")
        if critical:
            lines.append(f"  🔴 CRITICAL ({len(critical)}): " + ", ".join(a["endpoint"] for a in critical))
        if high:
            lines.append(f"  🟠 HIGH ({len(high)}): " + ", ".join(a["endpoint"] for a in high))
        if regressions:
            lines.append(f"  🔁 REGRESSIONS ({len(regressions)}): " + ", ".join(a["endpoint"] for a in regressions))
        if not critical and not high and not regressions:
            lines.append("  All failures are MEDIUM/LOW severity and non-regressive.")

        return "\n".join(lines)
