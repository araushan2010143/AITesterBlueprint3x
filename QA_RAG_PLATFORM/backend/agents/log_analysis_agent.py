"""
LogAnalysisAgent — parses structured logs and maps error patterns to known defects.

Takes CI/CD logs, application logs (JSON), or plain-text error output and:
  1. Extracts error patterns, stack traces, and anomalies
  2. Maps them to known defects via RAG retrieval
  3. Generates an incident summary with severity and recommended actions

Input:
  task.query     — raw log text or description of the failure
  task.extra     — {
                     "log_text":      "...",          # raw logs (JSON or plain text)
                     "log_source":    "github_actions | cloudwatch | datadog | plain",
                     "environment":   "prod | staging | ci",
                     "service_name":  "api-gateway",
                     "time_window":   "2026-07-17T10:00Z to 10:15Z",
                     "ci_url":        "https://github.com/.../actions/runs/123"
                   }

Output schema:
  {
    "log_source":        "github_actions",
    "environment":       "ci",
    "incident_severity": "critical | high | medium | low | info",
    "confidence":        0.81,
    "error_patterns": [
      {
        "pattern":       "ConnectionRefused: Redis port 6379",
        "frequency":     12,
        "category":      "infra | config | code | dependency | data",
        "severity":      "high",
        "first_seen":    "10:02:15",
        "last_seen":     "10:14:58"
      }
    ],
    "root_cause_hypothesis": "...",
    "matched_defects": [
      {"defect_id": "KAN-34", "title": "Redis timeout in staging", "similarity": 0.87}
    ],
    "anomalies":         ["Spike in 500 errors at 10:08Z"],
    "recommended_actions": [
      {"order": 1, "action": "Restart Redis pod", "owner": "DevOps"}
    ],
    "is_new_incident":   true,
    "incident_summary":  "..."
  }
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Tuple

from backend.agents.base_agent import BaseAgent, extract_json
from backend.agents.schemas import AgentTask

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a site reliability and QA incident analyst. Your job is to parse log output,
identify error patterns, and map them to known defects.

You are given:
1. LOG TEXT — raw logs (JSON structured, GitHub Actions output, or plain text).
2. LOG SOURCE — the system that produced the logs.
3. ENVIRONMENT — where the failure occurred.
4. RAG CONTEXT — similar past incidents and known defects from the knowledge base.

Return a JSON object:

  log_source              — github_actions | cloudwatch | datadog | plain
  environment             — prod | staging | ci | local
  incident_severity       — critical | high | medium | low | info
  confidence              — 0.0 to 1.0 overall confidence in the analysis
  error_patterns          — list of distinct error patterns found:
    pattern               — the error message template or pattern
    frequency             — how many times it appeared (estimate if unknown)
    category              — infra | config | code | dependency | data
    severity              — high | medium | low
    first_seen            — timestamp string or "" if not determinable
    last_seen             — timestamp string or "" if not determinable
  root_cause_hypothesis   — 2-3 sentence hypothesis of the root cause
  matched_defects         — list of {"defect_id", "title", "similarity"} from RAG:
                            similarity: 0.0 to 1.0 how closely this matches a known defect
  anomalies               — list of strings describing anomalies (traffic spikes, OOM, etc.)
  recommended_actions     — ordered list of {"order", "action", "owner"}:
                            owner: DevOps | Dev | QA | Infra | SecOps
  is_new_incident         — boolean: true if this doesn't match any known defect (similarity < 0.7)
  incident_summary        — 3-4 sentence executive summary for the incident report

Analysis rules:
  critical — production down, data loss, security breach
  high     — major feature unavailable, all users affected, SLA breach
  medium   — partial degradation, some users affected, workaround exists
  low      — minor errors, dev/staging only, no user impact

Return ONLY valid JSON — no prose, no code fences.
"""

# Patterns for pre-processing plain-text logs
_ERROR_INDICATORS = re.compile(
    r"(?:ERROR|FATAL|CRITICAL|Exception|Traceback|Error:|failed|refused|timeout|killed|OOMKilled)",
    re.IGNORECASE,
)


def preprocess_logs(log_text: str, source: str = "plain") -> str:
    """
    Pre-process raw logs before sending to LLM:
    - For JSON logs: extract only error-level entries
    - For plain text: extract lines containing error keywords
    - Truncate to 5000 chars
    """
    if not log_text:
        return ""

    lines = log_text.splitlines()

    if source in ("cloudwatch", "datadog"):
        # Try parsing as JSON log lines
        error_lines = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                level = (entry.get("level") or entry.get("severity") or entry.get("@level") or "").lower()
                if level in ("error", "fatal", "critical", "warn", "warning"):
                    error_lines.append(line)
            except (json.JSONDecodeError, TypeError):
                if _ERROR_INDICATORS.search(line):
                    error_lines.append(line)
        filtered = "\n".join(error_lines) if error_lines else log_text
    else:
        # Plain text: keep error-relevant lines + surrounding context (3 lines)
        keep_indices = set()
        for i, line in enumerate(lines):
            if _ERROR_INDICATORS.search(line):
                for j in range(max(0, i - 1), min(len(lines), i + 4)):
                    keep_indices.add(j)
        filtered_lines = [lines[i] for i in sorted(keep_indices)] if keep_indices else lines[:200]
        filtered = "\n".join(filtered_lines)

    # Truncate
    if len(filtered) > 5000:
        filtered = filtered[:4800] + "\n...(truncated)"
    return filtered


class LogAnalysisAgent(BaseAgent):
    name = "log_analysis_agent"
    description = "Parses CI/application logs to extract error patterns and map to known defects"

    def build_prompt(
        self,
        task: AgentTask,
        rag_context: str,
        graph_context: str,
    ) -> Tuple[str, str]:
        parts = []
        extra = task.extra or {}
        source = extra.get("log_source", "plain")

        parts.append(f"LOG SOURCE: {source}")
        if extra.get("environment"):
            parts.append(f"ENVIRONMENT: {extra['environment']}")
        if extra.get("service_name"):
            parts.append(f"SERVICE: {extra['service_name']}")
        if extra.get("time_window"):
            parts.append(f"TIME WINDOW: {extra['time_window']}")
        if extra.get("ci_url"):
            parts.append(f"CI URL: {extra['ci_url']}")

        # Prefer extra.log_text over task.query, but fall back to query
        raw_logs = extra.get("log_text") or task.query or ""
        if raw_logs:
            processed = preprocess_logs(raw_logs, source)
            parts.append(f"LOG OUTPUT:\n{processed}")
        else:
            parts.append("LOG TEXT: Not provided.")

        if rag_context:
            parts.append(f"SIMILAR PAST INCIDENTS AND KNOWN DEFECTS:\n{rag_context}")

        return _SYSTEM_PROMPT, "\n\n".join(parts)

    def parse_output(self, raw: str, task: AgentTask) -> Dict[str, Any]:
        extra = task.extra or {}
        parsed = extract_json(raw)
        if not isinstance(parsed, dict):
            parsed = {}
        parsed.setdefault("log_source",             extra.get("log_source", "plain"))
        parsed.setdefault("environment",            extra.get("environment", "unknown"))
        parsed.setdefault("incident_severity",      "medium")
        parsed.setdefault("confidence",             0.0)
        parsed.setdefault("error_patterns",         [])
        parsed.setdefault("root_cause_hypothesis",  "")
        parsed.setdefault("matched_defects",        [])
        parsed.setdefault("anomalies",              [])
        parsed.setdefault("recommended_actions",    [])
        parsed.setdefault("is_new_incident",        True)
        parsed.setdefault("incident_summary",       "")
        return parsed
