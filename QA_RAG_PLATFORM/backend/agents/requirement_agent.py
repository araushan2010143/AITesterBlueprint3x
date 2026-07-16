"""
RequirementAgent — extracts structured requirements from documents or free text.

Output schema (JSON array):
  [
    {
      "id":                   "REQ-001",
      "title":                "short title",
      "description":          "detailed description",
      "priority":             "Critical | High | Medium | Low",
      "category":             "functional | non-functional | security | performance | usability | compliance",
      "acceptance_criteria":  ["criterion 1", "criterion 2"],
      "testable":             true,
      "ambiguity_flags":      ["vague term: 'fast'"],
      "similar_existing":     []   // filled post-parse if RAG finds overlapping reqs
    }
  ]
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Tuple

from backend.agents.base_agent import BaseAgent, extract_json
from backend.agents.schemas import AgentTask

_SYSTEM_PROMPT = """\
You are a senior business analyst and QA architect specializing in requirements engineering.
Your task is to extract ALL explicit and implicit requirements from the provided text.

For each requirement produce a JSON object with these fields:
  id                  — sequential "REQ-001", "REQ-002", etc.
  title               — clear, concise title (max 10 words)
  description         — complete description of what must be true
  priority            — one of: Critical | High | Medium | Low
  category            — one of: functional | non-functional | security | performance | usability | compliance
  acceptance_criteria — list of 2-5 specific, testable statements ("The system shall...")
  testable            — boolean: can this be verified by a test?
  ambiguity_flags     — list of vague or ambiguous terms found (e.g. ["'fast' is undefined", "'user-friendly' is subjective"])

Rules:
- Do NOT invent requirements not supported by the text.
- Split compound requirements into separate entries.
- If the text has zero requirements, return an empty JSON array [].
- Return ONLY a valid JSON array — no prose, no code fences.
"""


class RequirementAgent(BaseAgent):
    name = "requirement_agent"
    description = "Extracts structured requirements from documents or free-form text"

    def build_prompt(
        self,
        task: AgentTask,
        rag_context: str,
        graph_context: str,
    ) -> Tuple[str, str]:
        parts = []
        if task.query:
            parts.append(f"INPUT TEXT:\n{task.query}")
        if rag_context:
            parts.append(f"ADDITIONAL CONTEXT FROM KNOWLEDGE BASE:\n{rag_context}")
        if not parts:
            parts.append("No input provided. Return [].")
        return _SYSTEM_PROMPT, "\n\n".join(parts)

    def parse_output(self, raw: str, task: AgentTask) -> Dict[str, Any]:
        parsed = extract_json(raw)
        if not isinstance(parsed, list):
            parsed = []
        # Normalise each item
        reqs = []
        for i, item in enumerate(parsed, start=1):
            if not isinstance(item, dict):
                continue
            item.setdefault("id", f"REQ-{i:03d}")
            item.setdefault("title", "")
            item.setdefault("description", "")
            item.setdefault("priority", "Medium")
            item.setdefault("category", "functional")
            item.setdefault("acceptance_criteria", [])
            item.setdefault("testable", True)
            item.setdefault("ambiguity_flags", [])
            reqs.append(item)
        return {
            "requirements": reqs,
            "count": len(reqs),
            "ambiguous_count": sum(1 for r in reqs if r.get("ambiguity_flags")),
            "untestable_count": sum(1 for r in reqs if not r.get("testable", True)),
        }
