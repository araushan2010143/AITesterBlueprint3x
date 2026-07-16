"""
ImpactAgent — analyses the downstream effect of changing a Story, Requirement,
Feature, or Module.

Uses both the Knowledge Graph (traversal for structural dependencies) and the
RAG knowledge base (semantic search for related docs) to produce a
comprehensive impact report.

Output schema:
  {
    "node_id":            "QA-42",
    "node_type":          "Story",
    "risk_level":         "high",       // critical | high | medium | low | none
    "risk_rationale":     "...",
    "affected_components": [
      {"type": "TestCase", "id": "...", "title": "...", "action": "must re-run"}
    ],
    "affected_modules":   ["Auth", "Payments"],
    "required_tests":     ["regression on login flow", "smoke test checkout"],
    "recommended_actions":[
      {"order": 1, "action": "Notify QA lead", "owner": "QA Lead"}
    ],
    "estimated_effort":   "M",          // S | M | L | XL
    "open_bugs_count":    2,
    "release_risk":       "Shipping without re-testing is HIGH risk"
  }
"""
from __future__ import annotations

import json
from typing import Any, Dict, Tuple

from backend.agents.base_agent import BaseAgent, extract_json
from backend.agents.schemas import AgentTask

_SYSTEM_PROMPT = """\
You are a QA Impact Analysis expert. Your job is to assess the downstream
consequences of changing a software artifact (Story, Requirement, Feature, or Module).

You are given:
1. GRAPH DATA — structural relationships (tests that cover this, bugs that affect it,
   release targets, related modules). This is the ground truth on what is connected.
2. RAG CONTEXT — semantically similar documents from the knowledge base.
3. NODE INFO — the specific artifact being changed.

Produce a JSON object with these fields:
  node_id              — the id of the changed artifact
  node_type            — Story | Requirement | Feature | Module
  risk_level           — critical | high | medium | low | none
  risk_rationale       — 2-3 sentence explanation of the risk assessment
  affected_components  — list of {"type", "id", "title", "action"} objects
  affected_modules     — list of module names impacted
  required_tests       — list of test areas/suites that MUST be executed
  recommended_actions  — ordered list of {"order", "action", "owner"} objects
  estimated_effort     — S (hours) | M (1-2 days) | L (3-5 days) | XL (>1 week)
  open_bugs_count      — number of open bugs related to this artifact
  release_risk         — one sentence on release risk if change ships without retesting

Risk level rules:
  critical — no test coverage OR > 3 open bugs OR used in a release scheduled within 2 weeks
  high     — < 3 test cases OR open bugs exist
  medium   — test coverage exists, no open bugs, not in imminent release
  low      — full coverage, zero bugs, not in any active release
  none     — no connected components found in graph (isolated artifact)

Return ONLY valid JSON — no prose, no code fences.
"""


class ImpactAgent(BaseAgent):
    name = "impact_agent"
    description = "Analyses downstream impact and risk of changing a Story, Requirement, Feature, or Module"

    def build_prompt(
        self,
        task: AgentTask,
        rag_context: str,
        graph_context: str,
    ) -> Tuple[str, str]:
        parts = []
        if task.node_id and task.node_type:
            parts.append(f"NODE BEING CHANGED:\n  type: {task.node_type}\n  id:   {task.node_id}")
        if task.query:
            parts.append(f"CHANGE DESCRIPTION:\n{task.query}")
        if graph_context:
            parts.append(f"GRAPH DATA (structural relationships):\n{graph_context}")
        else:
            parts.append("GRAPH DATA: Not available (Neo4j not configured).")
        if rag_context:
            parts.append(f"RAG CONTEXT (similar docs from knowledge base):\n{rag_context}")
        if not task.node_id and not task.query:
            parts.append("No target node specified.")
        return _SYSTEM_PROMPT, "\n\n".join(parts)

    def parse_output(self, raw: str, task: AgentTask) -> Dict[str, Any]:
        parsed = extract_json(raw)
        if not isinstance(parsed, dict):
            parsed = {}
        parsed.setdefault("node_id",             task.node_id or "")
        parsed.setdefault("node_type",           task.node_type or "")
        parsed.setdefault("risk_level",          "none")
        parsed.setdefault("risk_rationale",      "")
        parsed.setdefault("affected_components", [])
        parsed.setdefault("affected_modules",    [])
        parsed.setdefault("required_tests",      [])
        parsed.setdefault("recommended_actions", [])
        parsed.setdefault("estimated_effort",    "M")
        parsed.setdefault("open_bugs_count",     0)
        parsed.setdefault("release_risk",        "")
        return parsed
