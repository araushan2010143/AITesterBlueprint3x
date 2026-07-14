"""Generate an HTML migration report from per-file results."""
from typing import List, Dict, Any
from datetime import datetime


def _confidence_color(score: int) -> str:
    if score >= 80:
        return "#10b981"
    if score >= 60:
        return "#f59e0b"
    return "#ef4444"


def _severity_color(sev: str) -> str:
    return {"error": "#ef4444", "warning": "#f59e0b", "info": "#60a5fa"}.get(sev, "#9ca3af")


def generate_html_report(job_id: str, results: List[Dict[str, Any]]) -> str:
    done = [r for r in results if r["status"] == "done"]
    failed = [r for r in results if r["status"] == "failed"]
    avg_conf = round(sum(r["result"].get("confidence_score", 0) for r in done) / len(done)) if done else 0

    file_rows = ""
    for r in results:
        if r["status"] == "done":
            res = r["result"]
            sa = res.get("source_analysis", {})
            conf = res.get("confidence_score", 0)
            color = _confidence_color(conf)
            issues = res.get("issues", [])
            issue_html = "".join(
                f'<span style="color:{_severity_color(i.get("severity","info"))};font-size:11px;display:block;margin-top:2px;">⚠ {i.get("message","")}</span>'
                for i in issues[:3]
            )
            file_rows += f"""
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid #1f2937;font-size:13px;color:#e5e7eb;">{r["file"]}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #1f2937;font-size:13px;color:#9ca3af;">{sa.get("language","?")}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #1f2937;font-size:13px;color:#9ca3af;">{sa.get("framework","?")}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #1f2937;">
                <span style="color:{color};font-weight:700;font-size:14px;">{conf}</span>
                <span style="color:#6b7280;font-size:11px;">/100</span>
              </td>
              <td style="padding:10px 12px;border-bottom:1px solid #1f2937;font-size:12px;color:#9ca3af;">
                {len(issues)} issue{"s" if len(issues) != 1 else ""}
                {issue_html}
              </td>
            </tr>"""
        else:
            file_rows += f"""
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid #1f2937;font-size:13px;color:#e5e7eb;">{r["file"]}</td>
              <td colspan="4" style="padding:10px 12px;border-bottom:1px solid #1f2937;font-size:13px;color:#ef4444;">
                ✗ Failed — {r.get("error","unknown error")[:120]}
              </td>
            </tr>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Migration Report — {job_id[:8]}</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: #0f1117; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 40px; }}
  h1 {{ font-size: 24px; font-weight: 700; color: #f9fafb; margin-bottom: 4px; }}
  .meta {{ font-size: 12px; color: #6b7280; margin-bottom: 32px; }}
  .stats {{ display: flex; gap: 16px; margin-bottom: 32px; flex-wrap: wrap; }}
  .stat {{ background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 20px 24px; min-width: 140px; }}
  .stat-val {{ font-size: 28px; font-weight: 700; color: #a78bfa; }}
  .stat-lbl {{ font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; }}
  table {{ width: 100%; border-collapse: collapse; background: #111827; border-radius: 12px; overflow: hidden; border: 1px solid #1f2937; }}
  th {{ padding: 10px 12px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; background: #0f1117; border-bottom: 1px solid #1f2937; }}
  h2 {{ font-size: 16px; font-weight: 600; color: #f9fafb; margin-bottom: 16px; }}
</style>
</head>
<body>
  <h1>Migration Report</h1>
  <div class="meta">Job {job_id} &nbsp;·&nbsp; Generated {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}</div>
  <div class="stats">
    <div class="stat"><div class="stat-val">{len(results)}</div><div class="stat-lbl">Files Processed</div></div>
    <div class="stat"><div class="stat-val" style="color:#10b981;">{len(done)}</div><div class="stat-lbl">Succeeded</div></div>
    <div class="stat"><div class="stat-val" style="color:#ef4444;">{len(failed)}</div><div class="stat-lbl">Failed</div></div>
    <div class="stat"><div class="stat-val">{avg_conf}</div><div class="stat-lbl">Avg Confidence</div></div>
  </div>
  <h2>File Results</h2>
  <table>
    <thead>
      <tr>
        <th>File</th><th>Language</th><th>Framework</th><th>Confidence</th><th>Issues</th>
      </tr>
    </thead>
    <tbody>
      {file_rows}
    </tbody>
  </table>
</body>
</html>"""
