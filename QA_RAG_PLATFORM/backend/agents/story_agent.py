"""
StoryAgent — converts requirements into Agile user stories with BDD acceptance criteria.

Input:  task.items  → list of requirement dicts (from RequirementAgent output)
        task.query  → OR a free-text description of a feature

Output schema (JSON array):
  [
    {
      "id":                   "STORY-001",
      "linked_req_ids":       ["REQ-001", "REQ-002"],
      "title":                "short title",
      "persona":              "QA engineer",
      "user_story":           "As a QA engineer, I want to... so that...",
      "story_points":         5,
      "priority":             "High",
      "acceptance_criteria":  [
        {"given": "...", "when": "...", "then": "..."}
      ],
      "definition_of_done":   ["unit tests written", "reviewed by QA lead", "..."],
      "dependencies":         ["STORY-003"],
      "test_hints":           ["test happy path", "test empty input"]
    }
  ]
"""
from __future__ import annotations

import json
from typing import Any, Dict, Tuple

from backend.agents.base_agent import BaseAgent, extract_json
from backend.agents.schemas import AgentTask

_SYSTEM_PROMPT = """\
You are an expert agile coach and QA architect.
Convert the provided requirements into detailed Agile user stories.

Each story must include:
  id                   — sequential "STORY-001", "STORY-002", etc.
  linked_req_ids       — list of requirement IDs this story satisfies (e.g. ["REQ-001"])
  title                — concise story title
  persona              — specific user role (not just "user")
  user_story           — "As a [persona], I want [goal], so that [benefit]"
  story_points         — Fibonacci estimate: 1, 2, 3, 5, 8, or 13
  priority             — Critical | High | Medium | Low
  acceptance_criteria  — list of Given/When/Then objects:
                         {"given": "...", "when": "...", "then": "..."}
                         Minimum 2 scenarios per story.
  definition_of_done   — list of team-agnostic completion criteria
  dependencies         — list of other story IDs this story depends on (can be [])
  test_hints           — list of test strategy hints for QA

Rules:
- One story per requirement where possible; split large requirements.
- Acceptance criteria must be specific and testable — no vague language.
- story_points must reflect scope+complexity, not just size.
- Return ONLY a valid JSON array — no prose, no code fences.
"""


class StoryAgent(BaseAgent):
    name = "story_agent"
    description = "Converts requirements into Agile user stories with BDD acceptance criteria"

    def build_prompt(
        self,
        task: AgentTask,
        rag_context: str,
        graph_context: str,
    ) -> Tuple[str, str]:
        parts = []
        if task.items:
            reqs_json = json.dumps(task.items, indent=2)
            parts.append(f"REQUIREMENTS TO CONVERT:\n{reqs_json}")
        elif task.query:
            parts.append(f"FEATURE DESCRIPTION:\n{task.query}")
        if rag_context:
            parts.append(f"SIMILAR EXISTING STORIES IN KNOWLEDGE BASE:\n{rag_context}")
        if graph_context:
            parts.append(f"GRAPH CONTEXT (existing stories + epics):\n{graph_context}")
        if not parts:
            parts.append("No requirements provided. Return [].")
        return _SYSTEM_PROMPT, "\n\n".join(parts)

    def parse_output(self, raw: str, task: AgentTask) -> Dict[str, Any]:
        parsed = extract_json(raw)
        if not isinstance(parsed, list):
            parsed = []
        stories = []
        for i, item in enumerate(parsed, start=1):
            if not isinstance(item, dict):
                continue
            item.setdefault("id", f"STORY-{i:03d}")
            item.setdefault("linked_req_ids", [])
            item.setdefault("title", "")
            item.setdefault("persona", "user")
            item.setdefault("user_story", "")
            item.setdefault("story_points", 3)
            item.setdefault("priority", "Medium")
            item.setdefault("acceptance_criteria", [])
            item.setdefault("definition_of_done", [])
            item.setdefault("dependencies", [])
            item.setdefault("test_hints", [])
            stories.append(item)

        total_points = sum(s.get("story_points", 0) for s in stories)
        return {
            "stories": stories,
            "count": len(stories),
            "total_story_points": total_points,
            "priority_breakdown": _count_by(stories, "priority"),
        }


def _count_by(items, key):
    out = {}
    for item in items:
        v = item.get(key, "Unknown")
        out[v] = out.get(v, 0) + 1
    return out
