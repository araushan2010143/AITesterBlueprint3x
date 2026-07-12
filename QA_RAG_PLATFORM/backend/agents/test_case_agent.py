"""Generate comprehensive test cases from requirement text."""
import json
from typing import Any, Dict
from backend.llm.groq_llm import chat

PROMPT = """You are a senior QA engineer. Generate comprehensive test cases from the requirement below.

Return ONLY a JSON object:
{
  "test_cases": [
    {
      "id": "TC-001",
      "title": "...",
      "type": "Functional|Negative|Boundary|Accessibility|Performance|Security",
      "priority": "High|Medium|Low",
      "preconditions": "...",
      "steps": ["step 1", "step 2"],
      "expected_result": "...",
      "tags": ["regression", "smoke"]
    }
  ],
  "summary": {
    "total": 0,
    "functional": 0,
    "negative": 0,
    "boundary": 0,
    "accessibility": 0,
    "performance": 0,
    "security": 0
  }
}

Cover: Functional, Negative, Boundary, Accessibility, Performance, and Security scenarios.
Generate at least 10 test cases."""


def run(requirement_text: str, options: Dict[str, Any] = {}) -> Dict[str, Any]:
    messages = [
        {"role": "system", "content": PROMPT},
        {"role": "user", "content": f"Requirement:\n{requirement_text[:4000]}"},
    ]
    result = chat(messages, temperature=0.3, max_tokens=3000, json_mode=True)
    try:
        data = json.loads(result["answer"])
    except Exception:
        data = {"test_cases": [], "summary": {}, "raw": result["answer"]}
    return {**data, "tokens_used": result["tokens_used"], "latency_ms": result["latency_ms"]}
