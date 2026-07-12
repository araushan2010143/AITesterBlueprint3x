"""Detect duplicate or near-duplicate test cases."""
import json
from typing import Any, Dict
from backend.llm.groq_llm import chat

PROMPT = """You are a QA expert. Analyze these test cases and find duplicates or near-duplicates.

Return ONLY a JSON object:
{
  "duplicate_groups": [
    {
      "group_id": "G-001",
      "similarity_score": 0.95,
      "test_case_ids": ["TC-001", "TC-045"],
      "reason": "Both test cases verify the same login scenario with identical steps",
      "recommendation": "Merge into TC-001. Keep negative path from TC-045.",
      "action": "Merge|Delete|Keep"
    }
  ],
  "summary": {
    "total_analyzed": 0,
    "duplicates_found": 0,
    "unique_cases": 0,
    "estimated_reduction": "35%"
  }
}"""


def run(test_cases_text: str, options: Dict[str, Any] = {}) -> Dict[str, Any]:
    messages = [
        {"role": "system", "content": PROMPT},
        {"role": "user", "content": f"Test Cases to analyze:\n{test_cases_text[:5000]}"},
    ]
    result = chat(messages, temperature=0.1, max_tokens=2000, json_mode=True)
    try:
        data = json.loads(result["answer"])
    except Exception:
        data = {"duplicate_groups": [], "summary": {}, "raw": result["answer"]}
    return {**data, "tokens_used": result["tokens_used"], "latency_ms": result["latency_ms"]}
