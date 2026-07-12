"""Analyze requirement coverage and find testing gaps."""
import json
from typing import Any, Dict
from backend.llm.groq_llm import chat

PROMPT = """You are a QA architect. Analyze the requirements and test cases, then identify coverage gaps.

Return ONLY a JSON object:
{
  "coverage_summary": {
    "total_requirements": 0,
    "covered": 0,
    "partially_covered": 0,
    "not_covered": 0,
    "coverage_percentage": 0.0
  },
  "covered_requirements": [
    {"req_id": "REQ-101", "description": "...", "test_case_ids": ["TC-001"]}
  ],
  "gaps": [
    {
      "req_id": "REQ-205",
      "description": "Password reset via email",
      "missing_scenarios": [
        "OTP expiry after 10 minutes",
        "Rate limiting after 5 failed attempts",
        "Email delivery failure handling"
      ],
      "risk": "High|Medium|Low",
      "recommended_action": "Create 3 new test cases for edge cases"
    }
  ],
  "automation_gaps": [
    {"test_case_id": "TC-045", "reason": "High priority, stable feature — automate"}
  ]
}"""


def run(content: str, options: Dict[str, Any] = {}) -> Dict[str, Any]:
    messages = [
        {"role": "system", "content": PROMPT},
        {"role": "user", "content": f"Requirements and Test Cases:\n{content[:5000]}"},
    ]
    result = chat(messages, temperature=0.1, max_tokens=2500, json_mode=True)
    try:
        data = json.loads(result["answer"])
    except Exception:
        data = {"coverage_summary": {}, "gaps": [], "raw": result["answer"]}
    return {**data, "tokens_used": result["tokens_used"], "latency_ms": result["latency_ms"]}
