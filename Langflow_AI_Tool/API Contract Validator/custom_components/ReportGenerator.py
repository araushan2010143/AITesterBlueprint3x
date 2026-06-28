import json
import os
from datetime import datetime
from langflow.custom import Component
from langflow.io import DataInput, MessageTextInput, Output
from langflow.schema import Data

_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>API Contract Validation Report</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #f5f7fa; color: #333; }}
  header {{ background: #1a1a2e; color: #fff; padding: 24px 32px; }}
  header h1 {{ margin: 0; font-size: 1.6rem; }}
  header p {{ margin: 4px 0 0; opacity: .7; font-size: .9rem; }}
  .summary {{ display: flex; gap: 16px; padding: 24px 32px; }}
  .card {{ background: #fff; border-radius: 10px; padding: 20px 28px; min-width: 140px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }}
  .card .num {{ font-size: 2.2rem; font-weight: 700; }}
  .card .label {{ font-size: .85rem; opacity: .6; margin-top: 4px; }}
  .total .num {{ color: #1a1a2e; }}
  .pass .num {{ color: #22c55e; }}
  .fail .num {{ color: #ef4444; }}
  table {{ border-collapse: collapse; width: calc(100% - 64px); margin: 0 32px 32px; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08); }}
  th {{ background: #1a1a2e; color: #fff; padding: 12px 16px; text-align: left; font-size: .85rem; }}
  td {{ padding: 12px 16px; border-bottom: 1px solid #f0f0f0; font-size: .875rem; vertical-align: top; }}
  tr:last-child td {{ border-bottom: none; }}
  .badge {{ display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: .78rem; font-weight: 600; }}
  .PASS {{ background: #dcfce7; color: #166534; }}
  .FAIL {{ background: #fee2e2; color: #991b1b; }}
  .checks {{ margin: 0; padding-left: 16px; }}
  .checks li {{ margin-bottom: 4px; }}
</style>
</head>
<body>
<header>
  <h1>API Contract Validation Report</h1>
  <p>Generated: {generated_at}</p>
</header>
<div class="summary">
  <div class="card total"><div class="num">{total}</div><div class="label">Total APIs</div></div>
  <div class="card pass"><div class="num">{passed}</div><div class="label">Passed</div></div>
  <div class="card fail"><div class="num">{failed}</div><div class="label">Failed</div></div>
</div>
<table>
  <thead>
    <tr><th>Method</th><th>URL</th><th>Status</th><th>Duration</th><th>Result</th><th>Checks</th></tr>
  </thead>
  <tbody>
    {rows}
  </tbody>
</table>
</body>
</html>"""

_ROW_TEMPLATE = """<tr>
  <td><strong>{method}</strong></td>
  <td>{url}</td>
  <td>{status_code}</td>
  <td>{duration_ms} ms</td>
  <td><span class="badge {overall}">{overall}</span></td>
  <td><ul class="checks">{checks_html}</ul></td>
</tr>"""


class ReportGenerator(Component):
    display_name = "Report Generator"
    description = "Generates HTML, JSON, and Markdown reports from validation results."
    icon = "file-text"

    inputs = [
        DataInput(name="validation_report", display_name="Validation Report"),
        MessageTextInput(
            name="output_dir",
            display_name="Output Directory",
            value="reports",
        ),
    ]

    outputs = [
        Output(display_name="Report Paths", name="report_paths", method="generate"),
    ]

    def generate(self) -> Data:
        data = self.validation_report.data
        summary = data.get("summary", {})
        results = data.get("results", [])
        out_dir = self.output_dir or "reports"
        os.makedirs(out_dir, exist_ok=True)

        now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        html_path = os.path.join(out_dir, f"report_{ts}.html")
        json_path = os.path.join(out_dir, f"report_{ts}.json")
        md_path = os.path.join(out_dir, f"report_{ts}.md")

        self._write_html(html_path, summary, results, now)
        self._write_json(json_path, summary, results, now)
        self._write_markdown(md_path, summary, results, now)

        return Data(data={"html": html_path, "json": json_path, "markdown": md_path, "summary": summary})

    def _write_html(self, path: str, summary: dict, results: list, now: str) -> None:
        rows = ""
        for r in results:
            checks_html = "".join(
                f'<li><span class="badge {c["status"]}">{c["status"]}</span> {c["check"]}: {c["detail"]}</li>'
                for c in r.get("checks", [])
            )
            rows += _ROW_TEMPLATE.format(
                method=r.get("method", ""),
                url=r.get("url", ""),
                status_code=r.get("status_code", "N/A"),
                duration_ms=r.get("duration_ms", 0),
                overall=r.get("overall", "FAIL"),
                checks_html=checks_html,
            )

        html = _HTML_TEMPLATE.format(
            generated_at=now,
            total=summary.get("total", 0),
            passed=summary.get("passed", 0),
            failed=summary.get("failed", 0),
            rows=rows,
        )
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)

    def _write_json(self, path: str, summary: dict, results: list, now: str) -> None:
        payload = {"generated_at": now, "summary": summary, "results": results}
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, default=str)

    def _write_markdown(self, path: str, summary: dict, results: list, now: str) -> None:
        lines = [
            "# API Contract Validation Report",
            f"\n**Generated:** {now}\n",
            f"| Total | Passed | Failed |",
            f"|-------|--------|--------|",
            f"| {summary.get('total',0)} | {summary.get('passed',0)} | {summary.get('failed',0)} |",
            "\n## Results\n",
            "| Method | URL | HTTP | Duration | Result |",
            "|--------|-----|------|----------|--------|",
        ]
        for r in results:
            lines.append(
                f"| {r.get('method','')} | {r.get('url','')} | {r.get('status_code','N/A')} "
                f"| {r.get('duration_ms',0)} ms | {r.get('overall','')} |"
            )

        lines.append("\n### Check Details\n")
        for r in results:
            lines.append(f"#### {r.get('method','')} {r.get('url','')}")
            for c in r.get("checks", []):
                icon = "✅" if c["status"] == "PASS" else "❌"
                lines.append(f"- {icon} **{c['check']}**: {c['detail']}")
            lines.append("")

        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
