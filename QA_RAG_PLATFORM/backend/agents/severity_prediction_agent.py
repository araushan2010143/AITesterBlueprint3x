"""
SeverityPredictionAgent — predicts bug severity using historical patterns and context.

Input:
  task.query     — bug description / symptoms
  task.node_id   — Jira key (optional)
  task.extra     — {"component": "...", "environment": "...", "affected_users": N}

Output schema:
  {
    "bug_id":             "QA-42",
    "predicted_severity": "critical | high | medium | low",
    "confidence":         0.87,
    "severity_rationale": "...",
    "severity_factors": [
      {"factor": "Data loss risk", "weight": "high", "present": true},
      ...
    ],
    "sla_breach_risk":    true,
    "recommended_priority": "P1 | P2 | P3 | P4",
    "escalate_immediately": false,
    "similar_historical_bugs": [
      {"id": "...", "severity": "high", "resolution_days": 3}
    ]
  }
"""
from __future__ import annotations

from typing import Any, Dict, Tuple

from backend.agents.base_agent import BaseAgent, extract_json
from backend.agents.schemas import AgentTask

_SYSTEM_PROMPT = """\
You are a QA triage expert specialising in bug severity prediction.

You are given:
1. BUG INFORMATION — description, symptoms, affected component/environment.
2. RAG CONTEXT — similar historical bugs with their actual severities and resolution times.

Predict the severity of this bug and return a JSON object with these fields:

  bug_id                  — Jira key or empty string
  predicted_severity      — critical | high | medium | low
  confidence              — 0.0 to 1.0 prediction confidence
  severity_rationale      — 2-3 sentences explaining the prediction
  severity_factors        — list of {"factor", "weight", "present"} objects:
                             factor: e.g. "Data loss", "Security exposure", "Revenue impact",
                                     "User-facing crash", "Workaround exists", "Isolated to dev"
                             weight: high | medium | low
                             present: true | false (based on evidence)
  sla_breach_risk         — boolean: true if unaddressed this will breach a service SLA
  recommended_priority    — P1 (critical/blocker) | P2 (high) | P3 (medium) | P4 (low)
  escalate_immediately    — boolean: true if critical or security-related
  similar_historical_bugs — list of {"id", "severity", "resolution_days"} from RAG context

Severity rules:
  critical — data loss, security breach, system down, revenue blocked
  high     — major feature broken, no workaround, affects >20% of users
  medium   — degraded experience, workaround exists, partial functionality
  low      — cosmetic, minor UX, affects <5% users, workaround trivial

Return ONLY valid JSON — no prose, no code fences.
"""


class SeverityPredictionAgent(BaseAgent):
    name = "severity_prediction_agent"
    description = "Predicts bug severity using historical patterns, context, and impact signals"

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
            parts.append(f"BUG DESCRIPTION:\n{task.query}")

        extra = task.extra or {}
        if extra.get("component"):
            parts.append(f"COMPONENT: {extra['component']}")
        if extra.get("environment"):
            parts.append(f"ENVIRONMENT: {extra['environment']}")
        if extra.get("affected_users"):
            parts.append(f"ESTIMATED AFFECTED USERS: {extra['affected_users']}")
        if extra.get("rca_output"):
            parts.append(f"RCA OUTPUT (from prior analysis):\n{extra['rca_output']}")

        if graph_context:
            parts.append(f"GRAPH DATA:\n{graph_context}")
        if rag_context:
            parts.append(f"SIMILAR HISTORICAL BUGS:\n{rag_context}")

        if not task.query and not task.node_id:
            parts.append("No bug information provided. Return minimal JSON with confidence: 0.")

        return _SYSTEM_PROMPT, "\n\n".join(parts)

    def parse_output(self, raw: str, task: AgentTask) -> Dict[str, Any]:
        parsed = extract_json(raw)
        if not isinstance(parsed, dict):
            parsed = {}
        parsed.setdefault("bug_id",                  task.node_id or "")
        parsed.setdefault("predicted_severity",       "medium")
        parsed.setdefault("confidence",               0.0)
        parsed.setdefault("severity_rationale",       "")
        parsed.setdefault("severity_factors",         [])
        parsed.setdefault("sla_breach_risk",          False)
        parsed.setdefault("recommended_priority",     "P3")
        parsed.setdefault("escalate_immediately",     False)
        parsed.setdefault("similar_historical_bugs",  [])
        return parsed
