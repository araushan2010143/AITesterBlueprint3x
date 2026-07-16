"""
RegressionRecommendationAgent — recommends which test suites to run before releasing a fix.

Input:
  task.query     — bug description / fix summary
  task.node_id   — Jira key (optional)
  task.extra     — {
                     "affected_area": "Auth module",
                     "affected_layers": ["API", "Database"],
                     "fix_summary": "...",
                     "impact_output": {...}
                   }

Output schema:
  {
    "bug_id":                "QA-42",
    "regression_suites": [
      {
        "suite_name":       "Authentication E2E",
        "priority":         "must-run | should-run | optional",
        "rationale":        "...",
        "estimated_duration": "15 min",
        "automation_status": "automated | manual | partial"
      }
    ],
    "smoke_tests_required":  true,
    "full_regression_needed": false,
    "risk_if_skipped":       "...",
    "total_estimated_time":  "45 min",
    "confidence":            0.88
  }
"""
from __future__ import annotations

import json
from typing import Any, Dict, Tuple

from backend.agents.base_agent import BaseAgent, extract_json
from backend.agents.schemas import AgentTask

_SYSTEM_PROMPT = """\
You are a QA test strategy expert specialising in regression impact analysis.

You are given:
1. BUG / FIX INFORMATION — bug description, fix summary, affected area and layers.
2. IMPACT ANALYSIS OUTPUT — which components, modules, and tests are affected.
3. RAG CONTEXT — historical test execution data and regression suites from the knowledge base.

Recommend which regression test suites to run and return a JSON object:

  bug_id                  — Jira key or empty string
  regression_suites       — ordered list of suites to run:
    suite_name            — descriptive name of the test suite or area
    priority              — must-run | should-run | optional
    rationale             — one sentence WHY this suite is needed
    estimated_duration    — human-readable estimate (e.g., "20 min", "2 hours")
    automation_status     — automated | manual | partial
  smoke_tests_required    — boolean: always run smoke after any fix
  full_regression_needed  — boolean: true only if core shared code was modified
  risk_if_skipped         — one sentence on the risk of skipping recommended suites
  total_estimated_time    — sum of must-run + should-run suite durations
  confidence              — 0.0 to 1.0

Selection rules:
- must-run: directly tests the fixed component or shared utilities it uses
- should-run: tests adjacent features/flows that share data or services with the fix
- optional: broad coverage suites for extra confidence; can skip under time pressure
- Always include smoke if severity is high/critical.
- Recommend full regression only if the fix touches authentication, payments, or data storage.

Return ONLY valid JSON — no prose, no code fences.
"""


class RegressionRecommendationAgent(BaseAgent):
    name = "regression_recommendation_agent"
    description = "Recommends targeted regression test suites based on bug fix scope and impact"

    def build_prompt(
        self,
        task: AgentTask,
        rag_context: str,
        graph_context: str,
    ) -> Tuple[str, str]:
        parts = []
        if task.node_id:
            parts.append(f"BUG ID: {task.node_id}")
        if task.query:
            parts.append(f"BUG / FIX DESCRIPTION:\n{task.query}")

        extra = task.extra or {}
        if extra.get("affected_area"):
            parts.append(f"AFFECTED AREA: {extra['affected_area']}")
        if extra.get("affected_layers"):
            parts.append(f"AFFECTED LAYERS: {', '.join(extra['affected_layers'])}")
        if extra.get("fix_summary"):
            parts.append(f"FIX SUMMARY:\n{extra['fix_summary']}")
        if extra.get("impact_output"):
            parts.append(f"IMPACT ANALYSIS:\n{json.dumps(extra['impact_output'], indent=2)}")
        if extra.get("rca_output"):
            rca = extra["rca_output"]
            parts.append(f"RCA OUTPUT:\n{json.dumps(rca, indent=2) if isinstance(rca, dict) else rca}")

        if graph_context:
            parts.append(f"GRAPH DATA (test coverage, related modules):\n{graph_context}")
        if rag_context:
            parts.append(f"HISTORICAL TEST DATA:\n{rag_context}")

        return _SYSTEM_PROMPT, "\n\n".join(parts)

    def parse_output(self, raw: str, task: AgentTask) -> Dict[str, Any]:
        parsed = extract_json(raw)
        if not isinstance(parsed, dict):
            parsed = {}
        parsed.setdefault("bug_id",                task.node_id or "")
        parsed.setdefault("regression_suites",     [])
        parsed.setdefault("smoke_tests_required",  True)
        parsed.setdefault("full_regression_needed", False)
        parsed.setdefault("risk_if_skipped",       "")
        parsed.setdefault("total_estimated_time",  "unknown")
        parsed.setdefault("confidence",            0.0)
        return parsed
