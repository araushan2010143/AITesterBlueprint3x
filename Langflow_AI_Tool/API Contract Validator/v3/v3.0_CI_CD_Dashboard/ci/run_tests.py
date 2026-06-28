"""
Standalone CI/CD runner for API Contract Validator.
No Langflow needed — runs directly in GitHub Actions / Jenkins / any CI.

Usage:
    python run_tests.py --spec openapi.json --env QA --qa-url https://api.com
    python run_tests.py --spec postman.json --env DEV --dev-url https://dev.api.com

Exit codes:
    0 = all tests passed
    1 = one or more tests failed
"""

import argparse, json, re, sys, os, time, sqlite3, operator, requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

EXTRACT_KEYS = ["token","access_token","bookingid","id","userId","user_id","sessionId","orderId"]
OPS = {"==": operator.eq, "!=": operator.ne, ">": operator.gt,
       ">=": operator.ge, "<": operator.lt, "<=": operator.le}


# ── PARSERS ───────────────────────────────────────────────────────────
def parse_spec(spec, base_url=""):
    if isinstance(spec, list):
        return spec
    if "item" in spec:
        return parse_postman(spec)
    if str(spec.get("openapi","")).startswith("3"):
        return parse_openapi3(spec, base_url)
    if str(spec.get("swagger","")) == "2.0":
        return parse_swagger2(spec, base_url)
    raise ValueError("Unknown spec format. Expected OpenAPI 3.x, Swagger 2.0, or Postman v2.1")

def parse_openapi3(spec, base_url_override=""):
    servers  = spec.get("servers", [])
    base_url = base_url_override or (servers[0].get("url","").rstrip("/") if servers else "")
    reqs = []
    for path, path_item in spec.get("paths",{}).items():
        for method in ["get","post","put","patch","delete"]:
            op = path_item.get(method)
            if op is None: continue
            url  = base_url + re.sub(r"\{(\w+)\}", r"{{\1}}", path)
            body = _openapi3_body(op)
            reqs.append({"method": method.upper(), "url": url,
                         "headers": {"Content-Type": "application/json"},
                         "body": body, "cookies": {}})
    return reqs

def _openapi3_body(op):
    content = op.get("requestBody",{}).get("content",{})
    jc      = content.get("application/json",{})
    ex      = jc.get("example") or jc.get("schema",{}).get("example")
    if ex: return ex
    props = jc.get("schema",{}).get("properties",{})
    return {f: _default_val(s) for f,s in props.items()} if props else None

def parse_swagger2(spec, base_url_override=""):
    host      = spec.get("host","")
    scheme    = (spec.get("schemes",["https"]) or ["https"])[0]
    base_path = spec.get("basePath","").rstrip("/")
    base_url  = base_url_override or f"{scheme}://{host}{base_path}"
    reqs = []
    for path, path_item in spec.get("paths",{}).items():
        for method in ["get","post","put","patch","delete"]:
            op = path_item.get(method)
            if not op: continue
            url  = base_url + re.sub(r"\{(\w+)\}", r"{{\1}}", path)
            body = None
            for p in op.get("parameters",[]):
                if p.get("in") == "body":
                    s = p.get("schema",{})
                    body = s.get("example") or ({f:_default_val(fs) for f,fs in s.get("properties",{}).items()} if s.get("properties") else None)
            reqs.append({"method": method.upper(), "url": url,
                         "headers": {"Content-Type": "application/json"},
                         "body": body, "cookies": {}})
    return reqs

def parse_postman(collection):
    reqs = []
    _walk_postman(collection.get("item",[]), reqs)
    return reqs

def _walk_postman(items, reqs):
    for item in items:
        if "item" in item: _walk_postman(item["item"], reqs); continue
        req      = item.get("request",{})
        method   = req.get("method","GET").upper()
        url_data = req.get("url",{})
        url      = url_data.get("raw","") if isinstance(url_data,dict) else str(url_data)
        headers  = {h["key"]:h["value"] for h in req.get("header",[]) if not h.get("disabled")}
        body     = None
        bd       = req.get("body",{})
        if bd and bd.get("mode") == "raw":
            try: body = json.loads(bd.get("raw",""))
            except: body = bd.get("raw")
        reqs.append({"method": method, "url": url, "headers": headers, "body": body, "cookies": {}})

def _default_val(schema):
    return {"string":"example","integer":0,"number":0.0,
            "boolean":True,"array":[],"object":{}}.get(schema.get("type","string"),"example")


# ── EXECUTION ─────────────────────────────────────────────────────────
def run_sequential(reqs, store, max_retries=2):
    session = requests.Session()
    results = []
    for req in reqs:
        req    = resolve(req, store)
        result = with_retry(session, req, max_retries)
        if isinstance(result.get("response"), dict):
            for key in EXTRACT_KEYS:
                if key in result["response"]: store[key] = result["response"][key]
        results.append(result)
    session.close()
    return results

def with_retry(session, req, max_retries=2):
    method  = req.get("method","GET").upper()
    url     = req.get("url","")
    headers = req.get("headers") or {}
    body    = req.get("body")
    cookies = req.get("cookies") or {}
    last    = None
    for attempt in range(max_retries + 1):
        if attempt > 0: time.sleep((500 * (2**(attempt-1))) / 1000)
        start = time.time()
        try:
            resp = session.request(method, url, headers=headers,
                json=body if isinstance(body,dict) else None,
                data=body if isinstance(body,str) else None,
                cookies=cookies, timeout=30)
            duration = round((time.time()-start)*1000, 2)
            try: resp_body = resp.json()
            except: resp_body = resp.text
            last = {"method":method,"url":url,"status_code":resp.status_code,
                    "duration_ms":duration,"response":resp_body,"retries":attempt,"error":None}
            if resp.status_code in {500,502,503,504} and attempt < max_retries: continue
            return last
        except requests.exceptions.Timeout:
            last = {"method":method,"url":url,"status_code":None,"duration_ms":30000,
                    "response":None,"retries":attempt,"error":"TIMEOUT"}
        except Exception as e:
            last = {"method":method,"url":url,"status_code":None,"duration_ms":0,
                    "response":None,"retries":attempt,"error":str(e)}
    return last

def resolve(obj, store):
    text     = json.dumps(obj)
    resolved = re.sub(r"\{\{(\w+)\}\}", lambda m: str(store.get(m.group(1), m.group(0))), text)
    try: return json.loads(resolved)
    except: return obj


# ── VALIDATION ────────────────────────────────────────────────────────
def validate_one(result, schemas={}, assertions=[], expected_status={}, sla_thresholds={}):
    url, method  = result.get("url",""), result.get("method","")
    method_url   = f"{method} {url}"
    status, body = result.get("status_code"), result.get("response")
    duration_ms  = result.get("duration_ms") or 0
    checks = []

    if result.get("error"):
        checks.append({"check":"connectivity","status":"FAIL","detail":result["error"]})
    else:
        checks.append({"check":"connectivity","status":"PASS","detail":f"HTTP {status} in {duration_ms}ms"})

    for pattern, exp in expected_status.items():
        if _matches(method_url, pattern):
            ok = status == exp
            checks.append({"check":"status_code","status":"PASS" if ok else "FAIL",
                           "detail":f"expected {exp}, got {status}"})

    for pattern, threshold in sla_thresholds.items():
        if _matches(method_url, pattern):
            ok = duration_ms <= threshold
            checks.append({"check":f"sla:{threshold}ms","status":"PASS" if ok else "FAIL",
                           "detail":f"{duration_ms}ms {'≤' if ok else '>'} {threshold}ms SLA threshold"})

    schema = _find(method_url, schemas)
    if schema and isinstance(body, dict):
        for field in schema.get("required",[]):
            present = field in body and body[field] is not None
            checks.append({"check":f"required:{field}","status":"PASS" if present else "FAIL",
                           "detail":f"'{field}' {'present' if present else 'MISSING'}"})
        for field, etype in schema.get("types",{}).items():
            if field in body:
                atype = type(body[field]).__name__
                checks.append({"check":f"type:{field}","status":"PASS" if atype==etype else "FAIL",
                               "detail":f"expected {etype}, got {atype}"})

    for a in assertions:
        if _matches(method_url, a.get("url","")):
            checks.append(_assert(body, a))

    overall = "PASS" if all(c["status"]=="PASS" for c in checks) else "FAIL"
    return {"method":method,"url":url,"status_code":status,"duration_ms":duration_ms,
            "retries":result.get("retries",0),"overall":overall,"checks":checks}

def _find(method_url, schemas):
    for p,s in schemas.items():
        if _matches(method_url, p): return s
    return None

def _matches(method_url, pattern):
    return pattern in method_url or bool(re.search(pattern, method_url))

def _assert(body, a):
    field, op_str = a.get("field",""), a.get("operator","==")
    expected = a.get("value")
    label    = a.get("label", f"{field} {op_str} {expected}")
    actual   = _get(body, field)
    op_fn    = OPS.get(op_str)
    if not op_fn:
        return {"check":f"assert:{label}","status":"FAIL","detail":f"Unknown operator: {op_str}"}
    try: passed = op_fn(actual, expected)
    except: passed = False
    return {"check":f"assert:{label}","status":"PASS" if passed else "FAIL",
            "detail":f"{field}={actual!r} {op_str} {expected!r}"}

def _get(body, field):
    cur = body
    for part in field.split("."):
        cur = cur.get(part) if isinstance(cur,dict) else None
    return cur


# ── DATABASE ──────────────────────────────────────────────────────────
def init_db(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS test_runs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp   TEXT,
            environment TEXT,
            total       INTEGER,
            passed      INTEGER,
            failed      INTEGER,
            pass_rate   TEXT
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS endpoint_results (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id      INTEGER,
            method      TEXT,
            url         TEXT,
            status_code INTEGER,
            duration_ms REAL,
            overall     TEXT,
            retries     INTEGER,
            FOREIGN KEY (run_id) REFERENCES test_runs(id)
        )""")
    conn.commit()

def save_run(conn, timestamp, environment, total, passed, failed, pass_rate):
    cur = conn.execute(
        "INSERT INTO test_runs (timestamp,environment,total,passed,failed,pass_rate) VALUES (?,?,?,?,?,?)",
        (timestamp, environment, total, passed, failed, pass_rate))
    conn.commit()
    return cur.lastrowid

def save_endpoint(conn, run_id, ep):
    conn.execute(
        "INSERT INTO endpoint_results (run_id,method,url,status_code,duration_ms,overall,retries) VALUES (?,?,?,?,?,?,?)",
        (run_id, ep.get("method"), ep.get("url"), ep.get("status_code"),
         ep.get("duration_ms"), ep.get("overall"), ep.get("retries",0)))
    conn.commit()

def get_history(conn, limit=20):
    rows = conn.execute(
        "SELECT timestamp,environment,total,passed,failed,pass_rate FROM test_runs ORDER BY id DESC LIMIT ?",
        (limit,)).fetchall()
    return [{"timestamp":r[0],"environment":r[1],"total":r[2],"passed":r[3],
             "failed":r[4],"pass_rate":r[5]} for r in rows]

def get_endpoint_trends(conn, limit=20):
    rows = conn.execute("""
        SELECT e.url, e.method,
               COUNT(*) as total_runs,
               SUM(CASE WHEN e.overall='PASS' THEN 1 ELSE 0 END) as pass_count,
               AVG(e.duration_ms) as avg_duration
        FROM endpoint_results e
        JOIN test_runs r ON e.run_id = r.id
        WHERE r.id IN (SELECT id FROM test_runs ORDER BY id DESC LIMIT ?)
        GROUP BY e.url, e.method
    """, (limit,)).fetchall()
    return [{"url":r[0],"method":r[1],"total_runs":r[2],"pass_count":r[3],
             "pass_rate":round(r[3]/r[2]*100,1) if r[2] else 0,"avg_duration":round(r[4] or 0,2)} for r in rows]


# ── DASHBOARD HTML ────────────────────────────────────────────────────
def write_dashboard(path, history, trends):
    labels   = [h["timestamp"][-8:] for h in reversed(history)]
    rates    = [round(h["passed"]/h["total"]*100,1) if h["total"] else 0 for h in reversed(history)]
    trend_rows = ""
    for t in trends:
        color = "#22c55e" if t["pass_rate"]==100 else ("#f59e0b" if t["pass_rate"]>0 else "#ef4444")
        trend_rows += (f"<tr><td><b>{t['method']}</b></td><td>{t['url']}</td>"
                       f"<td style='color:{color};font-weight:700'>{t['pass_rate']}%</td>"
                       f"<td>{t['avg_duration']}ms</td><td>{t['total_runs']}</td></tr>")
    history_rows = ""
    for h in history:
        icon = "✅" if h["failed"]==0 else "❌"
        history_rows += (f"<tr><td>{h['timestamp']}</td><td>{h['environment']}</td>"
                         f"<td>{h['total']}</td><td>{h['passed']}</td><td>{h['failed']}</td>"
                         f"<td>{icon} {h['pass_rate']}</td></tr>")
    html = f"""<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>API Test History Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
body{{font-family:-apple-system,sans-serif;margin:0;background:#f5f7fa}}
header{{background:#1a1a2e;color:#fff;padding:24px 32px}}
h1{{margin:0;font-size:1.5rem}}h2{{padding:0 32px;color:#1a1a2e}}
.chart-wrap{{background:#fff;margin:24px 32px;padding:24px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.08)}}
table{{width:calc(100% - 64px);margin:0 32px 32px;border-collapse:collapse;background:#fff;
       border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}}
th{{background:#1a1a2e;color:#fff;padding:12px 16px;text-align:left;font-size:.85rem}}
td{{padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:.85rem}}
</style></head>
<body>
<header><h1>API Contract Validator — Historical Dashboard</h1></header>
<div class="chart-wrap">
  <canvas id="passChart" height="80"></canvas>
</div>
<h2>Endpoint Trends</h2>
<table><thead><tr><th>Method</th><th>URL</th><th>Pass Rate</th><th>Avg Duration</th><th>Runs</th></tr></thead>
<tbody>{trend_rows}</tbody></table>
<h2>Run History</h2>
<table><thead><tr><th>Timestamp</th><th>Env</th><th>Total</th><th>Passed</th><th>Failed</th><th>Pass Rate</th></tr></thead>
<tbody>{history_rows}</tbody></table>
<script>
new Chart(document.getElementById('passChart'), {{
  type: 'line',
  data: {{
    labels: {json.dumps(labels)},
    datasets: [{{
      label: 'Pass Rate %',
      data: {json.dumps(rates)},
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99,102,241,0.1)',
      tension: 0.3, fill: true, pointRadius: 5
    }}]
  }},
  options: {{
    plugins: {{legend: {{position:'top'}}, title: {{display:true,text:'Pass Rate Trend'}}}},
    scales: {{y: {{min:0,max:100,ticks:{{callback: v => v+'%'}}}}}}
  }}
}});
</script>
</body></html>"""
    with open(path,"w",encoding="utf-8") as f: f.write(html)


# ── MAIN ──────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="API Contract Validator CI/CD Runner")
    parser.add_argument("--spec",        required=True,  help="Path to OpenAPI/Postman JSON file")
    parser.add_argument("--env",         default="QA",   help="Active environment: DEV, QA, PROD")
    parser.add_argument("--dev-url",     default="",     help="DEV base URL")
    parser.add_argument("--qa-url",      default="",     help="QA base URL")
    parser.add_argument("--prod-url",    default="",     help="PROD base URL")
    parser.add_argument("--schemas",     default="{}",   help="Field schemas JSON string")
    parser.add_argument("--assertions",  default="[]",   help="Assertions JSON string")
    parser.add_argument("--expected",    default="{}",   help="Expected status codes JSON string")
    parser.add_argument("--sla",         default="{}",   help="SLA thresholds JSON string")
    parser.add_argument("--db",          default="reports/history.db", help="SQLite DB path")
    parser.add_argument("--output-dir",  default="reports",            help="Report output directory")
    parser.add_argument("--max-retries", default=2, type=int,          help="Max retry attempts")
    args = parser.parse_args()

    # Load spec
    with open(args.spec, "r") as f:
        spec = json.load(f)

    # Resolve base URL
    env     = args.env.strip().upper()
    url_map = {"DEV": args.dev_url, "QA": args.qa_url, "PROD": args.prod_url}
    base_url = url_map.get(env, "").strip().rstrip("/")

    # Parse spec
    requests_list = parse_spec(spec, base_url)
    print(f"[{env}] Parsed {len(requests_list)} requests from spec")

    # Execute
    store   = {}
    results = run_sequential(requests_list, store, args.max_retries)

    # Validate
    schemas         = json.loads(args.schemas)
    assertions      = json.loads(args.assertions)
    expected_status = json.loads(args.expected)
    sla_thresholds  = json.loads(args.sla)

    report = [validate_one(r, schemas, assertions, expected_status, sla_thresholds) for r in results]

    total  = len(report)
    passed = sum(1 for r in report if r["overall"]=="PASS")
    failed = total - passed
    now    = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    # Print results
    print(f"\nAPI Contract Validation — {now}")
    print(f"Environment: {env}")
    print(f"Total: {total} | Passed: {passed} | Failed: {failed} | Pass Rate: {round(passed/total*100)}%\n")

    for r in report:
        icon = "✅" if r["overall"]=="PASS" else "❌"
        print(f"{icon} {r['method']} {r['url']} — {r['status_code']} ({r['duration_ms']}ms) — {r['overall']}")
        for c in r["checks"]:
            print(f"   {'✅' if c['status']=='PASS' else '❌'} {c['check']}: {c['detail']}")

    # Save to DB
    os.makedirs(os.path.dirname(args.db) if os.path.dirname(args.db) else ".", exist_ok=True)
    conn = sqlite3.connect(args.db)
    init_db(conn)
    run_id = save_run(conn, now, env, total, passed, failed, f"{round(passed/total*100)}%" if total else "0%")
    for r in report:
        save_endpoint(conn, run_id, r)

    history = get_history(conn, 20)
    trends  = get_endpoint_trends(conn, 20)
    conn.close()

    # Write dashboard
    os.makedirs(args.output_dir, exist_ok=True)
    dashboard_path = os.path.join(args.output_dir, "dashboard.html")
    write_dashboard(dashboard_path, history, trends)
    print(f"\nDashboard saved: {dashboard_path}")

    # Write JSON report
    report_path = os.path.join(args.output_dir, f"report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json")
    with open(report_path,"w") as f:
        json.dump({"timestamp":now,"environment":env,"summary":{"total":total,"passed":passed,"failed":failed},
                   "results":report}, f, indent=2)
    print(f"Report saved:    {report_path}")

    # Exit with code 1 if any failures
    if failed > 0:
        print(f"\n❌ {failed} endpoint(s) FAILED — marking CI as FAILED")
        sys.exit(1)
    else:
        print(f"\n✅ All {total} endpoints PASSED")
        sys.exit(0)


if __name__ == "__main__":
    main()
