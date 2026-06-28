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
        "detects regressions via SQLite history, and outputs a structured analysis for the LLM. "
        "Also surfaces historical failures even when the current run is green."
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

    _SEVERITY_RANK = {
        "connectivity": 4,
        "status_5xx": 4,
        "status_mismatch": 3,
        "status_4xx": 3,
        "schema_missing": 3,
        "schema_type": 2,
        "assertion": 2,
        "sla": 1,
        "unknown": 1,
    }
    _SEVERITY_LABEL = {4: "CRITICAL", 3: "HIGH", 2: "MEDIUM", 1: "LOW"}

    _FIXES = {
        "connectivity": [
            "Verify the base URL is reachable (ping / curl the host directly).",
            "Check if a VPN or firewall is blocking the connection from the test runner.",
            "Confirm the service is deployed and healthy (check k8s pods / docker status).",
        ],
        "status_mismatch": [
            "Expected vs actual status mismatch — verify the correct HTTP status in your test config.",
            "Check if the API version or endpoint path changed (e.g. 201 Created vs 200 OK).",
            "Confirm the expected_status JSON matches the current API contract.",
        ],
        "status_401": [
            "Auth token is missing or expired — ensure POST /auth runs BEFORE this endpoint.",
            "Verify the Authorization header format: Bearer <token>.",
            "Check token TTL — add a refresh step before the chain if it expires quickly.",
        ],
        "status_403": [
            "Token is valid but the user lacks permission for this resource.",
            "Verify RBAC roles assigned to the test account in the target environment.",
        ],
        "status_404": [
            "Path parameter value is wrong — confirm the resource was created in a prior step.",
            "Verify the API version prefix in the URL.",
            "Resource may have been deleted by a previous test run — add idempotent setup.",
        ],
        "status_429": [
            "Rate limit exceeded — add delays between requests.",
            "Reduce parallel workers in API Test Suite (set to 1 for sequential execution).",
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

        # 1. Parse current-run failures from the enriched summary text
        current_failures = self._extract_failures(summary)

        # 2. Always pull historical failures from SQLite for richer analysis
        historical_failures = self._query_historical_failures()

        if not current_failures and not historical_failures:
            return Message(text=(
                f"{summary}\n\n"
                "=== ROOT CAUSE ANALYSIS ===\n"
                "No failures detected in current run or recent history. System is healthy."
            ))

        current_analyses = [self._analyze_failure(f, known_fixes) for f in current_failures]
        report = self._build_report(current_analyses, historical_failures, summary)
        return Message(text=report)

    # ── current-run failure parsing ────────────────────────────────────────────
    def _extract_failures(self, summary: str) -> list:
        failures = []
        lines = summary.split("\n")

        for i, line in enumerate(lines):
            stripped = line.strip()

            # endpoint-level failure: line has ❌ AND contains a HTTP method AND "FAIL" keyword
            # also catches "— FAIL" without ❌ in case emoji is stripped
            is_endpoint_fail = (
                ("❌" in stripped or "— FAIL" in stripped or "| FAIL" in stripped)
                and any(f" {m} " in f" {stripped} " or stripped.startswith(m + " ") or stripped.startswith("❌ " + m + " ")
                        for m in ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
            )
            if not is_endpoint_fail:
                continue

            failure: dict = {"raw": stripped, "checks": []}

            # extract method — works for both "❌ POST https://..." and "POST /path..."
            m = re.search(r"\b(GET|POST|PUT|PATCH|DELETE|HEAD)\b", stripped)
            if m:
                failure["method"] = m.group(1)
                # extract path — try short path first (/path), then full URL
                path_m = re.search(r"\b(GET|POST|PUT|PATCH|DELETE|HEAD)\b\s+(https?://[^\s]+|/[^\s—|]*)", stripped)
                failure["path"] = path_m.group(2).rstrip(" —|") if path_m else stripped
            else:
                failure["method"] = "UNKNOWN"
                failure["path"] = stripped

            # extract HTTP status code (e.g. "— 200 (")
            s = re.search(r"—\s*([1-5]\d{2})\s*\(", stripped)
            if not s:
                s = re.search(r"\b([1-5]\d{2})\b", stripped)
            failure["status_code"] = int(s.group(1)) if s else None

            # extract expected status from check lines if present
            failure["expected_status"] = None
            exp_m = re.search(r"expected\s+(\d{3}),?\s*got\s+(\d{3})", stripped, re.IGNORECASE)
            if exp_m:
                failure["expected_status"] = int(exp_m.group(1))
                failure["status_code"] = int(exp_m.group(2))

            # collect indented check lines that follow
            for j in range(i + 1, min(i + 10, len(lines))):
                nl = lines[j].strip()
                if not nl:
                    break
                if any(nl.startswith(k) for k in ("✅", "❌", "PERF", "HIST", "OVER", "FLAW", "---", "===", "timestamp:", "environment:", "total:")):
                    break
                if any(k in nl.lower() for k in ("check", "fail", "missing", "expected", "assert", "sla", "type", "required", "connectivity", "status_code")):
                    failure["checks"].append(nl)

            failures.append(failure)

        return failures

    # ── sqlite historical failure query ───────────────────────────────────────
    def _query_historical_failures(self) -> dict:
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            # endpoints that have failed at least once — uses 'overall' TEXT column
            cur.execute("""
                SELECT er.method, er.url, er.status_code,
                       COUNT(*) as total_runs,
                       SUM(CASE WHEN er.overall = 'FAIL' THEN 1 ELSE 0 END) as fail_count,
                       SUM(CASE WHEN er.overall = 'PASS' THEN 1 ELSE 0 END) as pass_count,
                       MAX(tr.timestamp) as last_seen
                FROM endpoint_results er
                JOIN test_runs tr ON er.run_id = tr.id
                GROUP BY er.method, er.url
                HAVING fail_count > 0
                ORDER BY fail_count DESC
                LIMIT 10
            """)
            rows = cur.fetchall()

            # recent runs that had at least one failure — uses 'timestamp' column
            cur.execute("""
                SELECT id, timestamp, environment, total, passed, failed, pass_rate
                FROM test_runs
                WHERE failed > 0
                ORDER BY timestamp DESC
                LIMIT 3
            """)
            failed_runs = cur.fetchall()
            conn.close()

            return {
                "failed_endpoints": [dict(r) for r in rows],
                "failed_runs": [dict(r) for r in failed_runs],
            }
        except Exception as exc:
            return {"failed_endpoints": [], "failed_runs": [], "error": str(exc)}

    # ── regression check ──────────────────────────────────────────────────────
    def _check_regression(self, method: str) -> dict:
        try:
            conn = sqlite3.connect(self.db_path)
            cur = conn.cursor()
            cur.execute("""
                SELECT er.overall, tr.timestamp, tr.environment
                FROM endpoint_results er
                JOIN test_runs tr ON er.run_id = tr.id
                WHERE er.method = ?
                ORDER BY tr.timestamp DESC
                LIMIT 10
            """, (method,))
            rows = cur.fetchall()
            conn.close()

            if not rows:
                return {"type": "NO_HISTORY", "detail": "No historical data for this method."}

            results = [r[0] == "PASS" for r in rows]
            if len(results) >= 2 and results[1]:  # was passing last run, now failing
                return {"type": "REGRESSION", "detail": f"Was PASSING in previous run ({rows[1][1]} [{rows[1][2]}])."}
            if all(not r for r in results):
                return {"type": "PERSISTENT", "detail": f"Failing for all {len(results)} recent runs — likely config/env issue."}
            passing = sum(1 for r in results if r)
            return {"type": "FLAKY", "detail": f"Passed {passing}/{len(results)} recent runs — intermittent issue."}
        except Exception as exc:
            return {"type": "UNKNOWN", "detail": f"Could not query history: {exc}"}

    # ── single failure analysis ───────────────────────────────────────────────
    def _analyze_failure(self, failure: dict, known_fixes: dict) -> dict:
        method = failure["method"]
        path = failure["path"]
        status = failure["status_code"]
        expected_status = failure.get("expected_status")
        checks = failure["checks"]
        raw = failure["raw"].lower()

        categories: list = []
        fixes: list = []

        # connectivity
        if any(k in raw for k in ("connection", "timeout", "refused", "unreachable", "network error")):
            categories.append("connectivity")
            fixes += self._FIXES["connectivity"]

        # status code mismatch (expected != actual)
        if expected_status and status and expected_status != status:
            categories.append("status_mismatch")
            fixes += self._FIXES["status_mismatch"]

        # classify by actual status code
        if status:
            if status >= 500:
                categories.append("status_5xx")
                fixes += self._FIXES["status_5xx"]
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
                fixes += [f"HTTP {status} — review API documentation for this error code."]

        # parse check detail lines for schema/assertion/sla failures
        for c in checks:
            cl = c.lower()
            # skip check lines that are about status codes (already handled)
            if "status_code" in cl or "status code" in cl:
                if "expected" in cl and "got" in cl:
                    # extract expected vs actual from check line if not already set
                    exp_m = re.search(r"expected\s+(\d{3}),?\s*got\s+(\d{3})", cl)
                    if exp_m and not expected_status:
                        exp, got = int(exp_m.group(1)), int(exp_m.group(2))
                        if exp != got:
                            if "status_mismatch" not in categories:
                                categories.append("status_mismatch")
                                fixes += self._FIXES["status_mismatch"]
                continue

            if ("missing" in cl or ("required" in cl and "fail" in cl)) and "schema_missing" not in categories:
                categories.append("schema_missing")
                fixes += self._FIXES["schema_missing"]
            if "type" in cl and ("mismatch" in cl or ("expected" in cl and "got" in cl)) and "schema_type" not in categories:
                categories.append("schema_type")
                fixes += self._FIXES["schema_type"]
            if ("assert" in cl or ("fail" in cl and "assert" in cl)) and "assertion" not in categories:
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

        # deduplicate
        seen: set = set()
        deduped = []
        for f in fixes:
            if f not in seen:
                seen.add(f)
                deduped.append(f)

        rank = max((self._SEVERITY_RANK.get(c, 1) for c in categories), default=1)
        severity = self._SEVERITY_LABEL[rank]
        regression = self._check_regression(method)

        return {
            "endpoint": f"{method} {path}",
            "status_code": status,
            "expected_status": expected_status,
            "response_ms": failure.get("response_ms"),
            "severity": severity,
            "categories": categories,
            "checks": checks,
            "fixes": deduped[:5],
            "regression": regression,
        }

    # ── report builder ────────────────────────────────────────────────────────
    def _build_report(self, current_analyses: list, historical: dict, original_summary: str) -> str:
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        sep = "=" * 64

        lines = [
            original_summary,
            "",
            sep,
            f"ROOT CAUSE ANALYSIS — {now}",
            sep,
        ]

        # ── current run failures ───────────────────────────────────────────────
        if current_analyses:
            lines.append(f"CURRENT RUN FAILURES: {len(current_analyses)}")
            lines.append("")

            sev_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
            sorted_a = sorted(current_analyses, key=lambda a: sev_order.get(a["severity"], 4))

            for i, a in enumerate(sorted_a, 1):
                sev_icon = {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🔵"}.get(a["severity"], "⚪")
                lines.append(f"[FAILURE {i}] {sev_icon} {a['endpoint']}")
                lines.append(f"  Severity   : {a['severity']}")
                lines.append(f"  Categories : {', '.join(a['categories'])}")
                if a["expected_status"] and a["status_code"]:
                    lines.append(f"  HTTP Status: got {a['status_code']}, expected {a['expected_status']}")
                elif a["status_code"]:
                    lines.append(f"  HTTP Status: {a['status_code']}")

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

            # priority summary
            critical = [a for a in sorted_a if a["severity"] == "CRITICAL"]
            high = [a for a in sorted_a if a["severity"] == "HIGH"]
            regressions = [a for a in sorted_a if a["regression"]["type"] == "REGRESSION"]

            lines.append("CURRENT RUN PRIORITY:")
            if critical:
                lines.append(f"  🔴 CRITICAL ({len(critical)}): " + ", ".join(a["endpoint"] for a in critical))
            if high:
                lines.append(f"  🟠 HIGH ({len(high)}): " + ", ".join(a["endpoint"] for a in high))
            if regressions:
                lines.append(f"  🔁 REGRESSIONS ({len(regressions)}): " + ", ".join(a["endpoint"] for a in regressions))
            if not critical and not high and not regressions:
                lines.append("  All current failures are MEDIUM/LOW severity.")
            lines.append("")
        else:
            lines.append("CURRENT RUN: ✅ All endpoints PASSED")
            lines.append("")

        # ── historical failures from SQLite ────────────────────────────────────
        failed_eps = historical.get("failed_endpoints", [])
        failed_runs = historical.get("failed_runs", [])

        if failed_eps or failed_runs:
            lines.append("HISTORICAL FAILURE INTELLIGENCE (from SQLite):")
            lines.append("")

            if failed_runs:
                lines.append("  Recent failed runs:")
                for r in failed_runs:
                    lines.append(f"    ❌ {r.get('timestamp','?')} [{r.get('environment','?')}] — {r.get('failed','?')}/{r.get('total','?')} FAILED ({r.get('pass_rate','?')})")
                lines.append("")

            if failed_eps:
                lines.append("  Most frequently failing endpoints (last 20 runs):")
                for ep in failed_eps[:5]:
                    fail_count = ep.get("fail_count", 0)
                    pass_count = ep.get("pass_count", 0)
                    total = fail_count + pass_count
                    pct = round((pass_count / total * 100) if total else 0)
                    stability = "FLAKY" if 0 < pct < 100 else ("ALWAYS FAILING" if pct == 0 else "STABLE")
                    lines.append(f"    [{stability}] {ep.get('method','?')} {ep.get('url','?')}")
                    lines.append(f"       Failed {fail_count}x | Pass rate {pct}% | Last seen: {ep.get('last_seen','?')}")

                    # suggest fix based on last known status code
                    sc = ep.get("status_code")
                    if sc:
                        fix_key = f"status_{sc}" if sc in (401, 403, 404, 429) else ("status_5xx" if sc >= 500 else None)
                        if fix_key and fix_key in self._FIXES:
                            lines.append(f"       Likely fix: {self._FIXES[fix_key][0]}")
                lines.append("")

        if "error" in historical:
            lines.append(f"  (Could not query SQLite history: {historical['error']})")

        return "\n".join(lines)
