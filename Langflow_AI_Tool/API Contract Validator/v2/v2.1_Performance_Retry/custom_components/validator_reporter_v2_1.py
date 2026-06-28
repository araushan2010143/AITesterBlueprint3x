import json
import re
import os
import operator
from datetime import datetime
from langflow.custom import Component
from langflow.io import MessageTextInput, Output
from langflow.schema.message import Message


class ValidatorReporter(Component):
    display_name = "Validator + Reporter v2.1"
    description = "Validates API responses with SLA checks and performance summary."
    icon = "file-text"

    inputs = [
        MessageTextInput(name="execution_results", display_name="Execution Results"),
        MessageTextInput(name="schemas_json",      display_name="Field Schemas (JSON)",         value="{}"),
        MessageTextInput(name="assertions_json",   display_name="Assertions (JSON)",             value="[]"),
        MessageTextInput(name="expected_status",   display_name="Expected Status Codes (JSON)",  value="{}"),
        MessageTextInput(name="sla_thresholds",    display_name="SLA Thresholds ms (JSON)",      value="{}",
                         info='Max response time per endpoint e.g. {"POST.*auth$": 3000}'),
        MessageTextInput(name="output_dir",        display_name="Output Directory",              value="reports"),
    ]

    outputs = [Output(display_name="Report Summary", name="summary", method="run")]

    OPS = {
        "==": operator.eq, "!=": operator.ne,
        ">":  operator.gt, ">=": operator.ge,
        "<":  operator.lt, "<=": operator.le,
    }

    def run(self) -> Message:
        raw = self.execution_results
        if hasattr(raw, "text"):
            raw = raw.text
        raw = str(raw).strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        try:
            data    = json.loads(raw)
            results = data.get("results", [])
        except Exception as e:
            return Message(text=f"Could not parse execution results: {e}\nReceived: {raw[:200]}")

        try:    schemas         = json.loads(self.schemas_json or "{}")
        except: schemas         = {}
        try:    assertions      = json.loads(self.assertions_json or "[]")
        except: assertions      = []
        try:    expected_status = json.loads(self.expected_status or "{}")
        except: expected_status = {}
        try:    sla_thresholds  = json.loads(self.sla_thresholds or "{}")
        except: sla_thresholds  = {}

        report = [self._validate_one(r, schemas, assertions, expected_status, sla_thresholds) for r in results]

        total  = len(report)
        passed = sum(1 for r in report if r["overall"] == "PASS")
        failed = total - passed
        summary = {
            "total": total, "passed": passed, "failed": failed,
            "pass_rate": f"{round((passed/total)*100)}%" if total else "0%",
        }

        out_dir = self.output_dir or "reports"
        os.makedirs(out_dir, exist_ok=True)
        ts  = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

        html_path = os.path.join(out_dir, f"report_{ts}.html")
        json_path = os.path.join(out_dir, f"report_{ts}.json")
        md_path   = os.path.join(out_dir, f"report_{ts}.md")

        self._write_html(html_path, summary, report, now)
        self._write_json(json_path, {"summary": summary, "results": report}, now)
        self._write_markdown(md_path, summary, report, now)

        durations = [r["duration_ms"] for r in report if r.get("duration_ms") is not None]
        perf_summary = ""
        if durations:
            perf_summary = (
                f"\nPERFORMANCE SUMMARY:"
                f"\n   avg: {round(sum(durations)/len(durations), 2)}ms"
                f" | min: {min(durations)}ms"
                f" | max: {max(durations)}ms"
            )

        endpoint_lines = []
        for r in report:
            icon       = "✅" if r["overall"] == "PASS" else "❌"
            retry_info = f" [retried {r.get('retries')} time(s)]" if r.get("retries", 0) > 0 else ""
            endpoint_lines.append(
                f"\n{icon} {r['method']} {r['url']} — {r['status_code']} ({r['duration_ms']}ms) — {r['overall']}{retry_info}"
            )
            for c in r.get("checks", []):
                s_icon = "✅" if c["status"] == "PASS" else "❌"
                endpoint_lines.append(f"   {s_icon} {c['check']}: {c['detail']}")

        text = (
            f"timestamp: {now}\n"
            f"total: {total} | passed: {passed} | failed: {failed} | pass_rate: {summary['pass_rate']}\n"
            f"Reports saved: HTML={html_path} | JSON={json_path} | MD={md_path}"
            f"{perf_summary}\n"
            f"\nENDPOINT DETAILS:"
            + "\n".join(endpoint_lines)
        )

        return Message(text=text)

    def _validate_one(self, result, schemas, assertions, expected_status, sla_thresholds):
        url, method   = result.get("url", ""), result.get("method", "")
        method_url    = f"{method} {url}"
        status, body  = result.get("status_code"), result.get("response")
        duration_ms   = result.get("duration_ms") or 0
        checks = []

        if result.get("error"):
            checks.append({"check": "connectivity", "status": "FAIL", "detail": result["error"]})
        else:
            checks.append({"check": "connectivity", "status": "PASS",
                           "detail": f"HTTP {status} in {duration_ms}ms"})

        for pattern, exp in expected_status.items():
            if self._matches(method_url, pattern):
                ok = status == exp
                checks.append({"check": "status_code",
                                "status": "PASS" if ok else "FAIL",
                                "detail": f"expected {exp}, got {status}"})

        for pattern, threshold in sla_thresholds.items():
            if self._matches(method_url, pattern):
                ok = duration_ms <= threshold
                checks.append({"check": f"sla:{threshold}ms",
                                "status": "PASS" if ok else "FAIL",
                                "detail": f"{duration_ms}ms {'≤' if ok else '>'} {threshold}ms SLA threshold"})

        schema = self._find(method_url, schemas)
        if schema and isinstance(body, dict):
            for field in schema.get("required", []):
                present = field in body and body[field] is not None
                checks.append({"check": f"required:{field}",
                               "status": "PASS" if present else "FAIL",
                               "detail": f"'{field}' {'present' if present else 'MISSING'}"})
            for field, etype in schema.get("types", {}).items():
                if field in body:
                    atype = type(body[field]).__name__
                    checks.append({"check": f"type:{field}",
                                   "status": "PASS" if atype == etype else "FAIL",
                                   "detail": f"expected {etype}, got {atype}"})

        for a in assertions:
            if self._matches(method_url, a.get("url", "")):
                checks.append(self._assert(body, a))

        overall = "PASS" if all(c["status"] == "PASS" for c in checks) else "FAIL"
        return {"method": method, "url": url, "status_code": status,
                "duration_ms": duration_ms, "retries": result.get("retries", 0),
                "overall": overall, "checks": checks}

    def _find(self, method_url, schemas):
        for p, s in schemas.items():
            if self._matches(method_url, p):
                return s
        return None

    def _matches(self, method_url, pattern):
        return pattern in method_url or bool(re.search(pattern, method_url))

    def _assert(self, body, a):
        field, op_str = a.get("field", ""), a.get("operator", "==")
        expected      = a.get("value")
        label         = a.get("label", f"{field} {op_str} {expected}")
        actual        = self._get(body, field)
        op_fn         = self.OPS.get(op_str)
        if not op_fn:
            return {"check": f"assert:{label}", "status": "FAIL", "detail": f"Unknown operator: {op_str}"}
        try:    passed = op_fn(actual, expected)
        except: passed = False
        return {"check": f"assert:{label}",
                "status": "PASS" if passed else "FAIL",
                "detail": f"{field}={actual!r} {op_str} {expected!r}"}

    def _get(self, body, field):
        cur = body
        for part in field.split("."):
            cur = cur.get(part) if isinstance(cur, dict) else None
        return cur

    def _write_html(self, path, summary, results, now):
        rows = ""
        for r in results:
            color  = "#22c55e" if r["overall"] == "PASS" else "#ef4444"
            bg     = "#dcfce7" if r["overall"] == "PASS" else "#fee2e2"
            retry  = f' <span style="color:#f59e0b">↻ {r["retries"]} retry</span>' if r.get("retries", 0) > 0 else ""
            checks = "".join(
                f'<li style="color:{"green" if c["status"]=="PASS" else "red"}">'
                f'{"✅" if c["status"]=="PASS" else "❌"} {c["check"]}: {c["detail"]}</li>'
                for c in r.get("checks", [])
            )
            rows += (
                f"<tr><td><b>{r['method']}</b></td><td>{r['url']}</td>"
                f"<td>{r['status_code']}</td><td>{r['duration_ms']}ms{retry}</td>"
                f"<td><span style='background:{bg};color:{color};padding:3px 10px;"
                f"border-radius:12px;font-weight:700'>{r['overall']}</span></td>"
                f"<td><ul style='margin:0;padding-left:16px'>{checks}</ul></td></tr>"
            )

        html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>API Contract Report</title>
<style>
  body{{font-family:-apple-system,sans-serif;margin:0;background:#f5f7fa}}
  header{{background:#1a1a2e;color:#fff;padding:24px 32px}}
  h1{{margin:0;font-size:1.5rem}} p{{margin:4px 0 0;opacity:.7}}
  .cards{{display:flex;gap:16px;padding:24px 32px}}
  .card{{background:#fff;border-radius:10px;padding:20px 28px;box-shadow:0 2px 8px rgba(0,0,0,.08)}}
  .num{{font-size:2rem;font-weight:700}} .lbl{{font-size:.8rem;opacity:.6}}
  table{{width:calc(100% - 64px);margin:0 32px 32px;border-collapse:collapse;
         background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}}
  th{{background:#1a1a2e;color:#fff;padding:12px 16px;text-align:left;font-size:.85rem}}
  td{{padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:.85rem;vertical-align:top}}
</style></head>
<body>
<header><h1>API Contract Validation Report v2.1</h1><p>Generated: {now}</p></header>
<div class="cards">
  <div class="card"><div class="num" style="color:#1a1a2e">{summary['total']}</div><div class="lbl">Total</div></div>
  <div class="card"><div class="num" style="color:#22c55e">{summary['passed']}</div><div class="lbl">Passed</div></div>
  <div class="card"><div class="num" style="color:#ef4444">{summary['failed']}</div><div class="lbl">Failed</div></div>
  <div class="card"><div class="num" style="color:#6366f1">{summary['pass_rate']}</div><div class="lbl">Pass Rate</div></div>
</div>
<table>
  <thead><tr><th>Method</th><th>URL</th><th>HTTP</th><th>Duration</th><th>Result</th><th>Checks</th></tr></thead>
  <tbody>{rows}</tbody>
</table>
</body></html>"""
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)

    def _write_json(self, path, data, now):
        data["generated_at"] = now
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def _write_markdown(self, path, summary, results, now):
        lines = [
            "# API Contract Validation Report v2.1",
            f"\n**Generated:** {now}\n",
            "| Total | Passed | Failed | Pass Rate |",
            "|-------|--------|--------|-----------|",
            f"| {summary['total']} | {summary['passed']} | {summary['failed']} | {summary['pass_rate']} |",
            "\n## Results\n",
            "| Method | URL | HTTP | Duration | Retries | Result |",
            "|--------|-----|------|----------|---------|--------|",
        ]
        for r in results:
            icon = "✅" if r["overall"] == "PASS" else "❌"
            lines.append(
                f"| {r['method']} | {r['url']} | {r['status_code']} | {r['duration_ms']}ms | {r.get('retries',0)} | {icon} {r['overall']} |"
            )
        lines.append("\n### Check Details\n")
        for r in results:
            lines.append(f"#### {r['method']} {r['url']}")
            for c in r.get("checks", []):
                icon = "✅" if c["status"] == "PASS" else "❌"
                lines.append(f"- {icon} **{c['check']}**: {c['detail']}")
            lines.append("")
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
