import re, json, time, os, operator, requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from langflow.custom import Component
from langflow.io import MessageTextInput, Output
from langflow.schema.message import Message


class APITestSuite(Component):
    display_name = "API Test Suite v2.2"
    description = "All-in-one: parses OpenAPI/Postman, executes, validates, generates reports."
    icon = "flask-conical"

    EXTRACT_KEYS = ["token","access_token","bookingid","id","userId","user_id","sessionId","orderId"]

    OPS = {
        "==": operator.eq, "!=": operator.ne,
        ">":  operator.gt, ">=": operator.ge,
        "<":  operator.lt, "<=": operator.le,
    }

    inputs = [
        MessageTextInput(name="spec_input",      display_name="OpenAPI / Postman JSON"),
        MessageTextInput(name="active_env",       display_name="Active Environment",           value="QA"),
        MessageTextInput(name="dev_url",          display_name="DEV Base URL",                 value=""),
        MessageTextInput(name="qa_url",           display_name="QA Base URL",                  value=""),
        MessageTextInput(name="prod_url",         display_name="PROD Base URL",                value=""),
        MessageTextInput(name="schemas_json",     display_name="Field Schemas (JSON)",         value="{}"),
        MessageTextInput(name="assertions_json",  display_name="Assertions (JSON)",            value="[]"),
        MessageTextInput(name="expected_status",  display_name="Expected Status Codes (JSON)", value="{}"),
        MessageTextInput(name="sla_thresholds",   display_name="SLA Thresholds ms (JSON)",     value="{}"),
        MessageTextInput(name="max_retries",      display_name="Max Retries",                  value="2"),
        MessageTextInput(name="parallel_workers", display_name="Parallel Workers",             value="1"),
        MessageTextInput(name="output_dir",       display_name="Output Directory",             value="reports"),
    ]

    outputs = [Output(display_name="Report Summary", name="summary", method="run")]

    # ── MAIN ──────────────────────────────────────────────────────────
    def run(self) -> Message:
        # 1. parse spec input
        raw = self.spec_input
        if hasattr(raw, "text"): raw = raw.text
        raw = str(raw).strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        try:
            spec = json.loads(raw)
        except Exception as e:
            return Message(text=f"Invalid JSON input: {e}")

        # 2. resolve base url from active environment
        env     = (self.active_env or "QA").strip().upper()
        url_map = {"DEV": self.dev_url or "", "QA": self.qa_url or "", "PROD": self.prod_url or ""}
        base_url = url_map.get(env, "").strip().rstrip("/")

        # 3. parse spec into requests list
        if isinstance(spec, list):
            requests_list = spec
        elif "item" in spec:
            requests_list = self._parse_postman(spec)
        elif str(spec.get("openapi", "")).startswith("3"):
            requests_list = self._parse_openapi3(spec)
        elif str(spec.get("swagger", "")) == "2.0":
            requests_list = self._parse_swagger2(spec)
        else:
            return Message(text="Unknown spec format. Expected OpenAPI 3.x, Swagger 2.0, or Postman v2.1")

        # 4. substitute base url across all requests
        if base_url:
            for req in requests_list:
                url = req.get("url", "")
                if url.startswith("http"):
                    req["url"] = re.sub(r'https?://[^/]+', base_url, url)
                elif url.startswith("/"):
                    req["url"] = base_url + url

        # 5. execute requests
        try:    max_retries = int(self.max_retries or 2)
        except: max_retries = 2
        try:    workers = int(self.parallel_workers or 1)
        except: workers = 1

        retry_statuses = {500, 502, 503, 504}
        store          = {}
        session        = requests.Session()

        if workers > 1:
            results = self._run_parallel(session, requests_list, store, max_retries, retry_statuses, workers)
        else:
            results = self._run_sequential(session, requests_list, store, max_retries, retry_statuses)
        session.close()

        # 6. validate results
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
            "pass_rate": f"{round((passed/total)*100)}%" if total else "0%"
        }

        # 7. write HTML / JSON / MD reports
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        ts  = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        out_dir = self.output_dir or "reports"
        os.makedirs(out_dir, exist_ok=True)
        self._write_html(os.path.join(out_dir, f"report_{ts}.html"), summary, report, now)
        self._write_json(os.path.join(out_dir, f"report_{ts}.json"), {"summary": summary, "results": report}, now)
        self._write_markdown(os.path.join(out_dir, f"report_{ts}.md"), summary, report, now)

        # 8. build LLM-ready summary text
        durations = [r["duration_ms"] for r in report if r.get("duration_ms")]
        perf = (
            f"\nPERFORMANCE SUMMARY:\n"
            f"   avg: {round(sum(durations)/len(durations), 2)}ms"
            f" | min: {min(durations)}ms"
            f" | max: {max(durations)}ms"
        ) if durations else ""

        lines = []
        for r in report:
            icon  = "✅" if r["overall"] == "PASS" else "❌"
            retry = f" [retried {r.get('retries')} time(s)]" if r.get("retries", 0) > 0 else ""
            lines.append(f"\n{icon} {r['method']} {r['url']} — {r['status_code']} ({r['duration_ms']}ms) — {r['overall']}{retry}")
            for c in r.get("checks", []):
                lines.append(f"   {'✅' if c['status']=='PASS' else '❌'} {c['check']}: {c['detail']}")

        return Message(text=(
            f"timestamp: {now}\n"
            f"environment: {env}\n"
            f"total: {total} | passed: {passed} | failed: {failed} | pass_rate: {summary['pass_rate']}"
            f"{perf}\n\nENDPOINT DETAILS:" + "\n".join(lines)
        ))

    # ── PARSERS ───────────────────────────────────────────────────────
    def _parse_openapi3(self, spec):
        servers  = spec.get("servers", [])
        base_url = servers[0].get("url", "").rstrip("/") if servers else ""
        reqs = []
        for path, path_item in spec.get("paths", {}).items():
            for method in ["get", "post", "put", "patch", "delete"]:
                op = path_item.get(method)
                if op is None: continue
                url  = base_url + re.sub(r"\{(\w+)\}", r"{{\1}}", path)
                body = self._openapi3_body(op)
                reqs.append({"method": method.upper(), "url": url,
                             "headers": {"Content-Type": "application/json"},
                             "body": body, "cookies": {}})
        return reqs

    def _openapi3_body(self, op):
        content = op.get("requestBody", {}).get("content", {})
        jc      = content.get("application/json", {})
        ex      = jc.get("example") or jc.get("schema", {}).get("example")
        if ex: return ex
        props = jc.get("schema", {}).get("properties", {})
        return {f: self._default_val(s) for f, s in props.items()} if props else None

    def _parse_swagger2(self, spec):
        host      = spec.get("host", "")
        scheme    = (spec.get("schemes", ["https"]) or ["https"])[0]
        base_path = spec.get("basePath", "").rstrip("/")
        base_url  = f"{scheme}://{host}{base_path}"
        reqs = []
        for path, path_item in spec.get("paths", {}).items():
            for method in ["get", "post", "put", "patch", "delete"]:
                op = path_item.get(method)
                if not op: continue
                url  = base_url + re.sub(r"\{(\w+)\}", r"{{\1}}", path)
                body = None
                for p in op.get("parameters", []):
                    if p.get("in") == "body":
                        s = p.get("schema", {})
                        body = s.get("example") or ({f: self._default_val(fs) for f, fs in s.get("properties", {}).items()} if s.get("properties") else None)
                reqs.append({"method": method.upper(), "url": url,
                             "headers": {"Content-Type": "application/json"},
                             "body": body, "cookies": {}})
        return reqs

    def _parse_postman(self, collection):
        reqs = []
        self._walk_postman(collection.get("item", []), reqs)
        return reqs

    def _walk_postman(self, items, reqs):
        for item in items:
            if "item" in item:
                self._walk_postman(item["item"], reqs)
                continue
            req      = item.get("request", {})
            method   = req.get("method", "GET").upper()
            url_data = req.get("url", {})
            url      = url_data.get("raw", "") if isinstance(url_data, dict) else str(url_data)
            headers  = {h["key"]: h["value"] for h in req.get("header", []) if not h.get("disabled")}
            body     = None
            bd       = req.get("body", {})
            if bd and bd.get("mode") == "raw":
                try: body = json.loads(bd.get("raw", ""))
                except: body = bd.get("raw")
            reqs.append({"method": method, "url": url, "headers": headers, "body": body, "cookies": {}})

    def _default_val(self, schema):
        return {"string": "example", "integer": 0, "number": 0.0,
                "boolean": True, "array": [], "object": {}}.get(schema.get("type", "string"), "example")

    # ── EXECUTION ─────────────────────────────────────────────────────
    def _run_sequential(self, session, reqs, store, max_retries, retry_statuses):
        results = []
        for req in reqs:
            req    = self._resolve(req, store)
            result = self._with_retry(session, req, max_retries, retry_statuses)
            if isinstance(result.get("response"), dict):
                for key in self.EXTRACT_KEYS:
                    if key in result["response"]:
                        store[key] = result["response"][key]
            result["resolved_with"] = dict(store)
            results.append(result)
        return results

    def _run_parallel(self, session, reqs, store, max_retries, retry_statuses, workers):
        resolved = [self._resolve(r, store) for r in reqs]
        ordered  = [None] * len(resolved)
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(self._with_retry, session, req, max_retries, retry_statuses): i
                       for i, req in enumerate(resolved)}
            for f in as_completed(futures):
                i = futures[f]
                try:
                    ordered[i] = f.result()
                except Exception as e:
                    r = resolved[i]
                    ordered[i] = {"method": r.get("method"), "url": r.get("url"),
                                  "status_code": None, "duration_ms": 0,
                                  "response": None, "retries": 0, "error": str(e)}
                ordered[i]["resolved_with"] = dict(store)
        return ordered

    def _with_retry(self, session, req, max_retries, retry_statuses):
        method  = req.get("method", "GET").upper()
        url     = req.get("url", "")
        headers = req.get("headers") or {}
        body    = req.get("body")
        cookies = req.get("cookies") or {}
        last    = None
        for attempt in range(max_retries + 1):
            if attempt > 0:
                time.sleep((500 * (2 ** (attempt - 1))) / 1000)
            start = time.time()
            try:
                resp = session.request(method, url, headers=headers,
                    json=body if isinstance(body, dict) else None,
                    data=body if isinstance(body, str) else None,
                    cookies=cookies, timeout=30)
                duration = round((time.time() - start) * 1000, 2)
                try:    resp_body = resp.json()
                except: resp_body = resp.text
                last = {"method": method, "url": url, "status_code": resp.status_code,
                        "duration_ms": duration, "response": resp_body,
                        "retries": attempt, "error": None}
                if resp.status_code in retry_statuses and attempt < max_retries:
                    continue
                return last
            except requests.exceptions.Timeout:
                last = {"method": method, "url": url, "status_code": None,
                        "duration_ms": 30000, "response": None, "retries": attempt, "error": "TIMEOUT"}
            except Exception as e:
                last = {"method": method, "url": url, "status_code": None,
                        "duration_ms": 0, "response": None, "retries": attempt, "error": str(e)}
        return last

    def _resolve(self, obj, store):
        text     = json.dumps(obj)
        resolved = re.sub(r"\{\{(\w+)\}\}", lambda m: str(store.get(m.group(1), m.group(0))), text)
        try:    return json.loads(resolved)
        except: return obj

    # ── VALIDATION ────────────────────────────────────────────────────
    def _validate_one(self, result, schemas, assertions, expected_status, sla_thresholds):
        url, method  = result.get("url", ""), result.get("method", "")
        method_url   = f"{method} {url}"
        status, body = result.get("status_code"), result.get("response")
        duration_ms  = result.get("duration_ms") or 0
        checks = []

        if result.get("error"):
            checks.append({"check": "connectivity", "status": "FAIL", "detail": result["error"]})
        else:
            checks.append({"check": "connectivity", "status": "PASS",
                           "detail": f"HTTP {status} in {duration_ms}ms"})

        for pattern, exp in expected_status.items():
            if self._matches(method_url, pattern):
                ok = status == exp
                checks.append({"check": "status_code", "status": "PASS" if ok else "FAIL",
                               "detail": f"expected {exp}, got {status}"})

        for pattern, threshold in sla_thresholds.items():
            if self._matches(method_url, pattern):
                ok = duration_ms <= threshold
                checks.append({"check": f"sla:{threshold}ms", "status": "PASS" if ok else "FAIL",
                               "detail": f"{duration_ms}ms {'≤' if ok else '>'} {threshold}ms SLA threshold"})

        schema = self._find(method_url, schemas)
        if schema and isinstance(body, dict):
            for field in schema.get("required", []):
                present = field in body and body[field] is not None
                checks.append({"check": f"required:{field}", "status": "PASS" if present else "FAIL",
                               "detail": f"'{field}' {'present' if present else 'MISSING'}"})
            for field, etype in schema.get("types", {}).items():
                if field in body:
                    atype = type(body[field]).__name__
                    checks.append({"check": f"type:{field}", "status": "PASS" if atype == etype else "FAIL",
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
            if self._matches(method_url, p): return s
        return None

    def _matches(self, method_url, pattern):
        return pattern in method_url or bool(re.search(pattern, method_url))

    def _assert(self, body, a):
        field, op_str = a.get("field", ""), a.get("operator", "==")
        expected = a.get("value")
        label    = a.get("label", f"{field} {op_str} {expected}")
        actual   = self._get(body, field)
        op_fn    = self.OPS.get(op_str)
        if not op_fn:
            return {"check": f"assert:{label}", "status": "FAIL", "detail": f"Unknown operator: {op_str}"}
        try:    passed = op_fn(actual, expected)
        except: passed = False
        return {"check": f"assert:{label}", "status": "PASS" if passed else "FAIL",
                "detail": f"{field}={actual!r} {op_str} {expected!r}"}

    def _get(self, body, field):
        cur = body
        for part in field.split("."):
            cur = cur.get(part) if isinstance(cur, dict) else None
        return cur

    # ── REPORT WRITERS ────────────────────────────────────────────────
    def _write_html(self, path, summary, results, now):
        rows = ""
        for r in results:
            color  = "#22c55e" if r["overall"] == "PASS" else "#ef4444"
            bg     = "#dcfce7" if r["overall"] == "PASS" else "#fee2e2"
            retry  = f' <span style="color:#f59e0b">↻ {r["retries"]} retry</span>' if r.get("retries", 0) > 0 else ""
            checks = "".join(
                f'<li style="color:{"green" if c["status"]=="PASS" else "red"}">{"✅" if c["status"]=="PASS" else "❌"} {c["check"]}: {c["detail"]}</li>'
                for c in r.get("checks", []))
            rows += (f"<tr><td><b>{r['method']}</b></td><td>{r['url']}</td>"
                     f"<td>{r['status_code']}</td><td>{r['duration_ms']}ms{retry}</td>"
                     f"<td><span style='background:{bg};color:{color};padding:3px 10px;"
                     f"border-radius:12px;font-weight:700'>{r['overall']}</span></td>"
                     f"<td><ul style='margin:0;padding-left:16px'>{checks}</ul></td></tr>")
        html = f"""<!DOCTYPE html><html><head><meta charset="UTF-8"><title>API Report</title>
<style>
body{{font-family:-apple-system,sans-serif;margin:0;background:#f5f7fa}}
header{{background:#1a1a2e;color:#fff;padding:24px 32px}}
h1{{margin:0;font-size:1.5rem}}p{{margin:4px 0 0;opacity:.7}}
.cards{{display:flex;gap:16px;padding:24px 32px}}
.card{{background:#fff;border-radius:10px;padding:20px 28px;box-shadow:0 2px 8px rgba(0,0,0,.08)}}
.num{{font-size:2rem;font-weight:700}}.lbl{{font-size:.8rem;opacity:.6}}
table{{width:calc(100% - 64px);margin:0 32px 32px;border-collapse:collapse;background:#fff;
       border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}}
th{{background:#1a1a2e;color:#fff;padding:12px 16px;text-align:left;font-size:.85rem}}
td{{padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:.85rem;vertical-align:top}}
</style></head>
<body>
<header><h1>API Contract Validation Report v2.2</h1><p>Generated: {now}</p></header>
<div class="cards">
  <div class="card"><div class="num" style="color:#1a1a2e">{summary['total']}</div><div class="lbl">Total</div></div>
  <div class="card"><div class="num" style="color:#22c55e">{summary['passed']}</div><div class="lbl">Passed</div></div>
  <div class="card"><div class="num" style="color:#ef4444">{summary['failed']}</div><div class="lbl">Failed</div></div>
  <div class="card"><div class="num" style="color:#6366f1">{summary['pass_rate']}</div><div class="lbl">Pass Rate</div></div>
</div>
<table>
  <thead><tr><th>Method</th><th>URL</th><th>HTTP</th><th>Duration</th><th>Result</th><th>Checks</th></tr></thead>
  <tbody>{rows}</tbody>
</table></body></html>"""
        with open(path, "w", encoding="utf-8") as f: f.write(html)

    def _write_json(self, path, data, now):
        data["generated_at"] = now
        with open(path, "w", encoding="utf-8") as f: json.dump(data, f, indent=2)

    def _write_markdown(self, path, summary, results, now):
        lines = [
            "# API Contract Validation Report v2.2",
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
            lines.append(f"| {r['method']} | {r['url']} | {r['status_code']} | {r['duration_ms']}ms | {r.get('retries',0)} | {icon} {r['overall']} |")
        lines.append("\n### Check Details\n")
        for r in results:
            lines.append(f"#### {r['method']} {r['url']}")
            for c in r.get("checks", []):
                lines.append(f"- {'✅' if c['status']=='PASS' else '❌'} **{c['check']}**: {c['detail']}")
            lines.append("")
        with open(path, "w", encoding="utf-8") as f: f.write("\n".join(lines))
