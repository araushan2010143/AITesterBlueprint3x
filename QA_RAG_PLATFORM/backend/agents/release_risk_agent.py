"""
ReleaseRiskAgent — assesses overall release readiness and risk level.

Synthesizes open bugs, test coverage, RCA insights, and historical release data
to produce a go/no-go recommendation.

Input:
  task.query     — release version or description (e.g., "v2.4.0 shipping Friday")
  task.node_id   — release id or sprint id (optional)
  task.extra     — {
                     "open_critical_bugs":  3,
                     "open_high_bugs":     12,
                     "test_coverage_pct":  78,
                     "failed_test_count":   4,
                     "rca_summaries":      [...],
                     "regression_output":  {...},
                     "release_date":       "2026-07-20"
                   }

Output schema:
  {
    "release_version":      "v2.4.0",
    "release_risk_level":   "critical | high | medium | low",
    "go_no_go":             "go | no-go | conditional-go",
    "confidence":           0.84,
    "risk_summary":         "...",
    "blocking_issues": [
      {"issue": "3 open P1 bugs", "category": "defects | coverage | env | process"}
    ],
    "risk_factors": [
      {"factor": "Auth regression not run", "severity": "high"}
    ],
    "conditions_for_go": [
      "Fix KAN-45 (payment crash) before release"
    ],
    "release_recommendation": "...",
    "estimated_post_release_incident_probability": 0.35
  }
"""
from __future__ import annotations

import json
from typing import Any, Dict, Tuple

from backend.agents.base_agent import BaseAgent, extract_json
from backend.agents.schemas import AgentTask

_SYSTEM_PROMPT = """\
You are a QA Release Manager expert assessing whether a software release is safe to ship.

You are given:
1. RELEASE INFORMATION — version, planned release date, description.
2. BUG METRICS — counts of open critical/high bugs, test failures.
3. TEST COVERAGE — percentage of coverage, regression status.
4. RCA SUMMARIES — root cause analyses of recent critical bugs.
5. RAG CONTEXT — historical release incident data and past go/no-go decisions.

Produce a release risk assessment and return a JSON object:

  release_version         — version string or "unknown"
  release_risk_level      — critical | high | medium | low
  go_no_go                — go | no-go | conditional-go
  confidence              — 0.0 to 1.0 confidence in the assessment
  risk_summary            — 3-4 sentence executive summary of the release risk
  blocking_issues         — list of {"issue", "category"} that must be resolved before release
                             category: defects | coverage | env | process | security
  risk_factors            — list of {"factor", "severity"} — all risk signals found
                             severity: high | medium | low
  conditions_for_go       — list of conditions that, if met, would change no-go → conditional-go
  release_recommendation  — one-paragraph actionable recommendation to the release manager
  estimated_post_release_incident_probability — 0.0 to 1.0 probability of a prod incident

Go/No-Go rules:
  no-go:            any open P1 (critical) bug OR test coverage < 60% OR > 3 failed smoke tests
  conditional-go:   1-2 open P2 bugs OR coverage 60-75% OR failed non-smoke tests
  go:               no open P1/P2 bugs AND coverage ≥ 75% AND all smoke tests passing

Return ONLY valid JSON — no prose, no code fences.
"""


class ReleaseRiskAgent(BaseAgent):
    name = "release_risk_agent"
    description = "Assesses release readiness with go/no-go recommendation based on bug metrics and coverage"

    def build_prompt(
        self,
        task: AgentTask,
        rag_context: str,
        graph_context: str,
    ) -> Tuple[str, str]:
        parts = []
        if task.node_id:
            parts.append(f"RELEASE ID: {task.node_id}")
        if task.query:
            parts.append(f"RELEASE DESCRIPTION:\n{task.query}")

        extra = task.extra or {}
        metrics = []
        if "open_critical_bugs" in extra:
            metrics.append(f"Open P1 (Critical) bugs: {extra['open_critical_bugs']}")
        if "open_high_bugs" in extra:
            metrics.append(f"Open P2 (High) bugs: {extra['open_high_bugs']}")
        if "test_coverage_pct" in extra:
            metrics.append(f"Test coverage: {extra['test_coverage_pct']}%")
        if "failed_test_count" in extra:
            metrics.append(f"Failed tests: {extra['failed_test_count']}")
        if "release_date" in extra:
            metrics.append(f"Planned release date: {extra['release_date']}")
        if metrics:
            parts.append("RELEASE METRICS:\n" + "\n".join(metrics))

        if extra.get("rca_summaries"):
            summaries = extra["rca_summaries"]
            parts.append(f"RECENT RCA SUMMARIES:\n{json.dumps(summaries, indent=2)}")

        if extra.get("regression_output"):
            parts.append(f"REGRESSION RECOMMENDATION:\n{json.dumps(extra['regression_output'], indent=2)}")

        if extra.get("severity_output"):
            parts.append(f"SEVERITY PREDICTIONS:\n{json.dumps(extra['severity_output'], indent=2)}")

        if graph_context:
            parts.append(f"KNOWLEDGE GRAPH (release/bug relationships):\n{graph_context}")
        if rag_context:
            parts.append(f"HISTORICAL RELEASE DATA:\n{rag_context}")

        if not task.query and not extra:
            parts.append("No release information provided. Return minimal JSON with go_no_go: 'no-go', confidence: 0.")

        return _SYSTEM_PROMPT, "\n\n".join(parts)

    def parse_output(self, raw: str, task: AgentTask) -> Dict[str, Any]:
        parsed = extract_json(raw)
        if not isinstance(parsed, dict):
            parsed = {}
        parsed.setdefault("release_version",     task.node_id or "unknown")
        parsed.setdefault("release_risk_level",  "high")
        parsed.setdefault("go_no_go",            "no-go")
        parsed.setdefault("confidence",          0.0)
        parsed.setdefault("risk_summary",        "")
        parsed.setdefault("blocking_issues",     [])
        parsed.setdefault("risk_factors",        [])
        parsed.setdefault("conditions_for_go",   [])
        parsed.setdefault("release_recommendation", "")
        parsed.setdefault("estimated_post_release_incident_probability", 0.5)
        return parsed
