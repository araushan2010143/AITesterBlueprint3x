import json, sqlite3, os
from datetime import datetime
from langflow.custom import Component
from langflow.io import MessageTextInput, Output
from langflow.schema.message import Message


class HistoricalDashboard(Component):
    display_name = "Historical Dashboard v3.0"
    description = "Stores test results in SQLite and generates historical trend dashboard."
    icon = "bar-chart-2"

    inputs = [
        MessageTextInput(name="report_summary",  display_name="Report Summary",
                         info="Wire from API Test Suite v2.2"),
        MessageTextInput(name="db_path",         display_name="Database Path",
                         value="reports/history.db"),
        MessageTextInput(name="history_limit",   display_name="History Limit", value="20"),
        MessageTextInput(name="output_dir",      display_name="Output Directory", value="reports"),
    ]

    outputs = [Output(display_name="Enriched Summary", name="enriched", method="run")]

    def run(self) -> Message:
        raw = self.report_summary
        if hasattr(raw, "text"): raw = raw.text
        raw = str(raw).strip()

        # parse summary text
        data = {}
        for line in raw.split("\n"):
            if line.startswith("timestamp:"):
                data["timestamp"] = line.split(":",1)[1].strip()
            elif line.startswith("environment:"):
                data["environment"] = line.split(":",1)[1].strip()
            elif line.startswith("total:"):
                for part in line.split("|"):
                    if ":" in part:
                        k, v = part.split(":",1)
                        data[k.strip()] = v.strip()

        timestamp   = data.get("timestamp", datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"))
        environment = data.get("environment", "QA")
        total       = int(data.get("total", 0))
        passed      = int(data.get("passed", 0))
        failed      = int(data.get("failed", 0))
        pass_rate   = data.get("pass_rate", "0%")

        # parse endpoints from summary
        endpoints = []
        for line in raw.split("\n"):
            if line.startswith("✅") or line.startswith("❌"):
                overall = "PASS" if line.startswith("✅") else "FAIL"
                parts   = line[2:].split(" — ")
                mu      = parts[0].strip().split(" ", 1)
                method  = mu[0] if mu else ""
                url     = mu[1] if len(mu) > 1 else ""
                dur     = None
                if len(parts) > 1 and "(" in parts[1]:
                    try: dur = float(parts[1].split("(")[1].split("ms")[0])
                    except: pass
                sc = None
                if len(parts) > 1:
                    try: sc = int(parts[1].strip().split(" ")[0])
                    except: pass
                endpoints.append({"method":method,"url":url,"status_code":sc,
                                   "duration_ms":dur,"overall":overall,"retries":0})

        # save to SQLite
        db_path = self.db_path or "reports/history.db"
        db_dir  = os.path.dirname(db_path)
        if db_dir: os.makedirs(db_dir, exist_ok=True)

        conn = sqlite3.connect(db_path)
        self._init_db(conn)
        run_id = self._save_run(conn, timestamp, environment, total, passed, failed, pass_rate)
        for ep in endpoints:
            self._save_endpoint(conn, run_id, ep)

        limit   = int(self.history_limit or 20)
        history = self._get_history(conn, limit)
        trends  = self._get_trends(conn, limit)
        conn.close()

        # write dashboard
        out_dir = self.output_dir or "reports"
        os.makedirs(out_dir, exist_ok=True)
        dashboard_path = os.path.join(out_dir, "dashboard.html")
        self._write_dashboard(dashboard_path, history, trends)

        # build enriched summary
        history_lines = ["\n\nHISTORICAL TRENDS (last runs):"]
        for h in history[:10]:
            icon = "✅" if h["failed"] == 0 else "❌"
            history_lines.append(
                f"  {icon} {h['timestamp']} [{h['environment']}] — {h['passed']}/{h['total']} PASS ({h['pass_rate']})"
            )

        flaky = [f"{t['method']} {t['url']}" for t in trends if 0 < t["pass_rate"] < 100]
        avg_rate = round(
            sum(h["passed"]/h["total"]*100 for h in history if h["total"]>0) / len(history), 1
        ) if history else 0

        return Message(text=(
            raw
            + "\n".join(history_lines)
            + f"\nOVERALL AVG PASS RATE (last {len(history)} runs): {avg_rate}%"
            + (f"\nFLAKY ENDPOINTS: {', '.join(flaky)}" if flaky else "\nFLAKY ENDPOINTS: none")
            + f"\nDashboard: {dashboard_path}"
        ))

    def _init_db(self, conn):
        conn.execute("""CREATE TABLE IF NOT EXISTS test_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT, environment TEXT,
            total INTEGER, passed INTEGER, failed INTEGER, pass_rate TEXT)""")
        conn.execute("""CREATE TABLE IF NOT EXISTS endpoint_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER, method TEXT, url TEXT,
            status_code INTEGER, duration_ms REAL, overall TEXT, retries INTEGER,
            FOREIGN KEY (run_id) REFERENCES test_runs(id))""")
        conn.commit()

    def _save_run(self, conn, timestamp, environment, total, passed, failed, pass_rate):
        cur = conn.execute(
            "INSERT INTO test_runs (timestamp,environment,total,passed,failed,pass_rate) VALUES (?,?,?,?,?,?)",
            (timestamp, environment, total, passed, failed, pass_rate))
        conn.commit()
        return cur.lastrowid

    def _save_endpoint(self, conn, run_id, ep):
        conn.execute(
            "INSERT INTO endpoint_results (run_id,method,url,status_code,duration_ms,overall,retries) VALUES (?,?,?,?,?,?,?)",
            (run_id, ep.get("method"), ep.get("url"), ep.get("status_code"),
             ep.get("duration_ms"), ep.get("overall"), ep.get("retries",0)))
        conn.commit()

    def _get_history(self, conn, limit):
        rows = conn.execute(
            "SELECT timestamp,environment,total,passed,failed,pass_rate FROM test_runs ORDER BY id DESC LIMIT ?",
            (limit,)).fetchall()
        return [{"timestamp":r[0],"environment":r[1],"total":r[2],
                 "passed":r[3],"failed":r[4],"pass_rate":r[5]} for r in rows]

    def _get_trends(self, conn, limit):
        rows = conn.execute("""
            SELECT e.url, e.method,
                   COUNT(*) as total_runs,
                   SUM(CASE WHEN e.overall='PASS' THEN 1 ELSE 0 END) as pass_count,
                   AVG(e.duration_ms) as avg_duration
            FROM endpoint_results e
            JOIN test_runs r ON e.run_id = r.id
            WHERE r.id IN (SELECT id FROM test_runs ORDER BY id DESC LIMIT ?)
            GROUP BY e.url, e.method""", (limit,)).fetchall()
        return [{"url":r[0],"method":r[1],"total_runs":r[2],"pass_count":r[3],
                 "pass_rate":round(r[3]/r[2]*100,1) if r[2] else 0,
                 "avg_duration":round(r[4] or 0,2)} for r in rows]

    def _write_dashboard(self, path, history, trends):
        labels = [h["timestamp"][-8:] for h in reversed(history)]
        rates  = [round(h["passed"]/h["total"]*100,1) if h["total"] else 0 for h in reversed(history)]
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
</style></head><body>
<header><h1>API Contract Validator — Historical Dashboard v3.0</h1></header>
<div class="chart-wrap"><canvas id="passChart" height="80"></canvas></div>
<h2>Endpoint Trends</h2>
<table><thead><tr><th>Method</th><th>URL</th><th>Pass Rate</th><th>Avg Duration</th><th>Total Runs</th></tr></thead>
<tbody>{trend_rows}</tbody></table>
<h2>Run History</h2>
<table><thead><tr><th>Timestamp</th><th>Env</th><th>Total</th><th>Passed</th><th>Failed</th><th>Result</th></tr></thead>
<tbody>{history_rows}</tbody></table>
<script>
new Chart(document.getElementById('passChart'),{{
  type:'line',
  data:{{labels:{json.dumps(labels)},datasets:[{{
    label:'Pass Rate %',data:{json.dumps(rates)},
    borderColor:'#6366f1',backgroundColor:'rgba(99,102,241,0.1)',
    tension:0.3,fill:true,pointRadius:5
  }}]}},
  options:{{plugins:{{title:{{display:true,text:'Pass Rate Trend Over Time'}}}},
            scales:{{y:{{min:0,max:100,ticks:{{callback:v=>v+'%'}}}}}}}}
}});
</script></body></html>"""
        with open(path,"w",encoding="utf-8") as f: f.write(html)
