"""
RCAAgent — Root Cause Analysis for bugs.

Takes a bug description (or Jira bug key) and produces a structured RCA
using graph traversal + RAG retrieval of similar past bugs and code docs.

Input:
  task.query     — bug description OR Jira key
  task.node_id   — bug node id in graph (optional)
  task.node_type — "Bug"

Output schema:
  {
    "bug_id":           "QA-99" or "",
    "probable_causes":  [
      {
        "rank":        1,
        "cause":       "...",
        "category":    "code | config | environment | data | process | external",
        "evidence":    "what in the context supports this theory",
        "confidence":  0.85
      }
    ],
    "affected_area":    "module or component most likely at fault",
    "affected_layers":  ["UI", "API", "Database"],
    "fix_suggestions":  [
      {"priority": 1, "suggestion": "...", "effort": "S | M | L"}
    ],
    "prevention":       ["action to prevent recurrence"],
    "similar_bugs":     [{"id": "...", "title": "...", "excerpt": "..."}],
    "confidence":       0.72,
    "needs_escalation": false,
    "escalation_reason": ""
  }
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Tuple

from backend.agents.base_agent import BaseAgent, extract_json
from backend.agents.schemas import AgentTask

_SYSTEM_PROMPT = """\
You are a senior QA engineer and debugging expert performing Root Cause Analysis (RCA).

You are given:
1. BUG INFORMATION — the bug description, symptoms, and severity.
2. GRAPH DATA — related stories, modules, recent changes, and test failures from the Knowledge Graph.
3. RAG CONTEXT — similar past bugs and relevant documentation retrieved from the knowledge base.

Perform a structured RCA and return a JSON object with these fields:

  bug_id             — Jira key or empty string
  probable_causes    — RANKED list of cause objects (most likely first):
                       {"rank", "cause", "category", "evidence", "confidence"}
                       category: code | config | environment | data | process | external
                       confidence: 0.0-1.0
  affected_area      — the module / component most likely at fault
  affected_layers    — list from: UI | API | Database | Infrastructure | Integration | Third-party
  fix_suggestions    — ordered list of {"priority", "suggestion", "effort"} (effort: S/M/L)
  prevention         — list of process/code/test actions to prevent recurrence
  similar_bugs       — list of {"id", "title", "excerpt"} from RAG context
  confidence         — overall RCA confidence score 0.0-1.0
  needs_escalation   — boolean: true if root cause is outside the team's control
  escalation_reason  — reason if needs_escalation is true, else ""

Rules:
- Rank causes by evidence strength + frequency in similar bugs.
- If RAG context shows a similar resolved bug, reference its fix.
- If graph shows no related stories/modules, note low structural context.
- Return ONLY valid JSON — no prose, no code fences.
"""


class RCAAgent(BaseAgent):
    name = "rca_agent"
    description = "Root Cause Analysis — traces bug causes using Knowledge Graph + RAG"

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
            parts.append(f"BUG DESCRIPTION / SYMPTOMS:\n{task.query}")
        if graph_context:
            parts.append(f"GRAPH DATA (related stories, modules, test results):\n{graph_context}")
        else:
            parts.append("GRAPH DATA: Not available (Neo4j not configured).")
        if rag_context:
            parts.append(f"RAG CONTEXT (similar past bugs + relevant docs):\n{rag_context}")
        if not task.query and not task.node_id:
            parts.append("No bug information provided. Return a minimal JSON with confidence: 0.")
        return _SYSTEM_PROMPT, "\n\n".join(parts)

    def parse_output(self, raw: str, task: AgentTask) -> Dict[str, Any]:
        parsed = extract_json(raw)
        if not isinstance(parsed, dict):
            parsed = {}
        parsed.setdefault("bug_id",            task.node_id or "")
        parsed.setdefault("probable_causes",   [])
        parsed.setdefault("affected_area",     "")
        parsed.setdefault("affected_layers",   [])
        parsed.setdefault("fix_suggestions",   [])
        parsed.setdefault("prevention",        [])
        parsed.setdefault("similar_bugs",      [])
        parsed.setdefault("confidence",        0.0)
        parsed.setdefault("needs_escalation",  False)
        parsed.setdefault("escalation_reason", "")
        return parsed
