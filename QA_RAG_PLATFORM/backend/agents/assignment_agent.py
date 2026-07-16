"""
AssignmentAgent — recommends the optimal team member to assign a bug to.

Input:
  task.query     — bug description / title
  task.node_id   — Jira key (optional)
  task.extra     — {
                     "severity": "high",
                     "component": "Auth",
                     "rca_output": {...},
                     "team_members": [{"name": "Alice", "skills": [...], "current_load": 3}]
                   }

Output schema:
  {
    "bug_id":              "QA-42",
    "recommended_assignee": "Alice Chen",
    "confidence":           0.82,
    "assignment_rationale": "...",
    "skill_match_score":    0.91,
    "workload_score":       0.7,
    "alternative_assignees": [
      {"name": "Bob Patel", "reason": "domain expert, higher load"}
    ],
    "escalate_to_lead":    false,
    "escalation_reason":   ""
  }
"""
from __future__ import annotations

import json
from typing import Any, Dict, Tuple

from backend.agents.base_agent import BaseAgent, extract_json
from backend.agents.schemas import AgentTask

_SYSTEM_PROMPT = """\
You are an engineering team lead expert at optimal bug assignment.

You are given:
1. BUG INFORMATION — description, severity, affected component, RCA output.
2. TEAM MEMBERS — list of engineers with their skills and current open ticket count.
3. RAG CONTEXT — historical assignment patterns for similar bugs.

Recommend the best engineer to assign this bug and return a JSON object:

  bug_id               — Jira key or empty string
  recommended_assignee — full name of the recommended engineer
  confidence           — 0.0 to 1.0 confidence in this assignment
  assignment_rationale — 2-3 sentences explaining WHY this person is the best fit:
                         consider domain expertise, current workload, past similar bugs fixed
  skill_match_score    — 0.0 to 1.0 how well their skills match the bug's affected area
  workload_score       — 0.0 to 1.0 (1.0 = lightest load, 0.0 = overloaded)
  alternative_assignees— list of {"name", "reason"} backup options (max 2)
  escalate_to_lead     — boolean: true if bug is critical and lead should be looped in
  escalation_reason    — reason if escalate_to_lead is true, else ""

Assignment rules:
- Domain expertise (skill_match) outweighs workload for critical/high severity bugs.
- For medium/low severity, balance expertise with workload evenly.
- If no team members are provided, recommend "Team Lead" and set confidence to 0.3.
- Never assign a P1 bug to someone with > 5 open critical tickets.

Return ONLY valid JSON — no prose, no code fences.
"""


class AssignmentAgent(BaseAgent):
    name = "assignment_agent"
    description = "Recommends optimal bug assignee based on skills, load, and historical patterns"

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
        if extra.get("severity"):
            parts.append(f"SEVERITY: {extra['severity']}")
        if extra.get("component"):
            parts.append(f"COMPONENT: {extra['component']}")
        if extra.get("rca_output"):
            import json as _json
            rca = extra["rca_output"]
            parts.append(f"RCA OUTPUT:\n{_json.dumps(rca, indent=2) if isinstance(rca, dict) else rca}")
        if extra.get("team_members"):
            parts.append(f"TEAM MEMBERS:\n{json.dumps(extra['team_members'], indent=2)}")
        else:
            parts.append("TEAM MEMBERS: Not provided — recommend 'Team Lead' as fallback.")

        if rag_context:
            parts.append(f"HISTORICAL ASSIGNMENT PATTERNS:\n{rag_context}")

        return _SYSTEM_PROMPT, "\n\n".join(parts)

    def parse_output(self, raw: str, task: AgentTask) -> Dict[str, Any]:
        parsed = extract_json(raw)
        if not isinstance(parsed, dict):
            parsed = {}
        parsed.setdefault("bug_id",               task.node_id or "")
        parsed.setdefault("recommended_assignee",  "Team Lead")
        parsed.setdefault("confidence",            0.0)
        parsed.setdefault("assignment_rationale",  "")
        parsed.setdefault("skill_match_score",     0.0)
        parsed.setdefault("workload_score",        0.0)
        parsed.setdefault("alternative_assignees", [])
        parsed.setdefault("escalate_to_lead",      False)
        parsed.setdefault("escalation_reason",     "")
        return parsed
