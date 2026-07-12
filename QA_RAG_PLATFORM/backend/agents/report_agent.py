"""Analyze test execution reports — RCA, release summary, failure explanation."""
import json
from typing import Any, Dict
from backend.llm.groq_llm import chat

RCA_PROMPT = """You are a QA lead doing root cause analysis of test failures.

Return ONLY a JSON object:
{
  "failure_summary": {
    "total_tests": 0, "passed": 0, "failed": 0, "blocked": 0, "skipped": 0
  },
  "root_causes": [
    {
      "category": "Locator Changed|API Failure|Auth Token Expired|Network Timeout|Data Issue|Environment",
      "count": 5,
      "affected_tests": ["TC-001", "TC-045"],
      "description": "...",
      "fix": "Update CSS selectors in login.spec.ts line 34-56",
      "priority": "Critical|High|Medium|Low"
    }
  ],
  "recommendations": ["..."],
  "release_risk": "High|Medium|Low",
  "release_recommendation": "Block|Conditional|Proceed"
}"""

RELEASE_PROMPT = """You are a QA manager. Generate a professional release summary.

Return ONLY a JSON object:
{
  "release_summary": {
    "version": "...", "date": "...",
    "regression": {"passed": 0, "failed": 0, "blocked": 0, "coverage": "95%"},
    "smoke": {"passed": 0, "failed": 0},
    "new_features_tested": 0,
    "defects_found": 0, "defects_fixed": 0, "deferred": 0
  },
  "ready_to_release": true,
  "conditions": [],
  "highlights": [],
  "risks": []
}"""

EXPLAIN_PROMPT = """You are a senior automation engineer. Explain this test failure clearly.

Return ONLY a JSON object:
{
  "failure_type": "Element Not Found|Timeout|Assertion Error|Network Error|Auth Error|...",
  "root_cause": "...",
  "technical_explanation": "...",
  "fix_suggestion": "...",
  "code_fix": "// example fix if applicable",
  "confidence": 0.92,
  "similar_failures": []
}"""

AUTOMATE_PROMPT = """You are an automation architect. Recommend which manual test cases to automate.

Return ONLY a JSON object:
{
  "recommendations": [
    {
      "test_case_id": "TC-001",
      "title": "...",
      "automation_priority": "High|Medium|Low",
      "framework": "Playwright|Selenium|Cypress|API",
      "estimated_roi": "90%",
      "stability": "High|Medium|Low",
      "reason": "..."
    }
  ],
  "summary": {
    "total_analyzed": 0, "recommended": 0,
    "estimated_time_saved": "40 hours/sprint"
  }
}"""

SCRIPT_PROMPT = """You are a senior automation engineer. Generate a {framework} test script.

Return ONLY a JSON object:
{{"script": "// full working test script here", "filename": "test_name.spec.ts", "framework": "{framework}"}}"""

TEST_DATA_PROMPT = """You are a QA data engineer. Generate comprehensive test data.

Return ONLY a JSON object:
{
  "test_data": {
    "valid_users": [{"username": "...", "password": "...", "email": "..."}],
    "invalid_users": [{"username": "...", "reason": "..."}],
    "boundary_values": [{"field": "...", "value": "...", "type": "min|max|boundary"}],
    "sql_injection": ["...", "..."],
    "xss_payloads": ["...", "..."]
  },
  "download_available": true
}"""


def run_rca(content: str, options: Dict[str, Any] = {}) -> Dict[str, Any]:
    result = chat(
        [{"role": "system", "content": RCA_PROMPT},
         {"role": "user", "content": f"Test Execution Report:\n{content[:5000]}"}],
        temperature=0.1, max_tokens=2000, json_mode=True
    )
    try:
        data = json.loads(result["answer"])
    except Exception:
        data = {"root_causes": [], "raw": result["answer"]}
    return {**data, "tokens_used": result["tokens_used"], "latency_ms": result["latency_ms"]}


def run_release_summary(content: str, options: Dict[str, Any] = {}) -> Dict[str, Any]:
    result = chat(
        [{"role": "system", "content": RELEASE_PROMPT},
         {"role": "user", "content": f"Execution data:\n{content[:5000]}"}],
        temperature=0.1, max_tokens=1500, json_mode=True
    )
    try:
        data = json.loads(result["answer"])
    except Exception:
        data = {"release_summary": {}, "raw": result["answer"]}
    return {**data, "tokens_used": result["tokens_used"], "latency_ms": result["latency_ms"]}


def run_explain_failure(content: str, options: Dict[str, Any] = {}) -> Dict[str, Any]:
    result = chat(
        [{"role": "system", "content": EXPLAIN_PROMPT},
         {"role": "user", "content": f"Failure log/trace:\n{content[:4000]}"}],
        temperature=0.1, max_tokens=1000, json_mode=True
    )
    try:
        data = json.loads(result["answer"])
    except Exception:
        data = {"failure_type": "Unknown", "raw": result["answer"]}
    return {**data, "tokens_used": result["tokens_used"], "latency_ms": result["latency_ms"]}


def run_automate(content: str, options: Dict[str, Any] = {}) -> Dict[str, Any]:
    result = chat(
        [{"role": "system", "content": AUTOMATE_PROMPT},
         {"role": "user", "content": f"Manual test cases:\n{content[:5000]}"}],
        temperature=0.2, max_tokens=2000, json_mode=True
    )
    try:
        data = json.loads(result["answer"])
    except Exception:
        data = {"recommendations": [], "raw": result["answer"]}
    return {**data, "tokens_used": result["tokens_used"], "latency_ms": result["latency_ms"]}


def run_generate_script(content: str, options: Dict[str, Any] = {}) -> Dict[str, Any]:
    framework = options.get("framework", "Playwright TypeScript")
    prompt = SCRIPT_PROMPT.format(framework=framework)
    result = chat(
        [{"role": "system", "content": prompt},
         {"role": "user", "content": f"Test case to automate:\n{content[:3000]}"}],
        temperature=0.2, max_tokens=2000, json_mode=True
    )
    try:
        data = json.loads(result["answer"])
    except Exception:
        data = {"script": result["answer"], "framework": framework}
    return {**data, "tokens_used": result["tokens_used"], "latency_ms": result["latency_ms"]}


def run_test_data(content: str, options: Dict[str, Any] = {}) -> Dict[str, Any]:
    count = options.get("count", 10)
    result = chat(
        [{"role": "system", "content": TEST_DATA_PROMPT},
         {"role": "user", "content": f"Generate {count} records per category for:\n{content[:2000]}"}],
        temperature=0.4, max_tokens=2000, json_mode=True
    )
    try:
        data = json.loads(result["answer"])
    except Exception:
        data = {"test_data": {}, "raw": result["answer"]}
    return {**data, "tokens_used": result["tokens_used"], "latency_ms": result["latency_ms"]}
