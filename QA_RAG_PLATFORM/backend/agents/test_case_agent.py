"""Generate comprehensive enterprise test cases from requirement text."""
import json
from typing import Any, Dict
from backend.llm.groq_llm import chat

PROMPT = """You are a senior QA engineer writing industry-standard test cases compatible with JIRA Zephyr Scale, Azure DevOps Test Plans, and TestRail.

== NAMING CONVENTION ==
TC_<MODULE>_<FEATURE>_<TYPE>_<SEQ>
Examples: TC_AUTH_LOGIN_FUNCTIONAL_001, TC_AUTH_LOGIN_NEGATIVE_002, TC_CHECKOUT_PAYMENT_BOUNDARY_001

== STEP WRITING RULES ==
- Actions in imperative form: "Navigate to...", "Enter...", "Click...", "Verify..."
- Exactly 3 steps per test case
- Expected Results must be observable — never "works correctly"
- Test Data values go in the test_data field, NOT embedded in steps

== COVERAGE REQUIREMENTS ==
Generate exactly 5 test cases (1 per type):
Functional | Negative | Boundary | Security | Accessibility

== ABSOLUTE RULES ==
- Return ONLY valid JSON — no markdown fences, no explanation outside JSON
- Exactly 2 steps per test case — no more, no less
- Keep steps concise: action ≤ 8 words, expected_result ≤ 10 words
- Preconditions: exactly 1 item (one short sentence)
- post_conditions: one short sentence
- automation_tags: exactly 2 tags
- summary, traceability: keep under 10 words each

== OUTPUT FORMAT ==
{
  "test_cases": [
    {
      "id": "TC_AUTH_LOGIN_FUNCTIONAL_001",
      "summary": "Verify that user can log in successfully with valid credentials",
      "requirement_id": "REQ-AUTH-001",
      "module": "Authentication",
      "feature": "Login",
      "priority": "High",
      "severity": "Critical",
      "type": "Functional",
      "automation": "Yes",
      "category": "Happy Path",
      "technique": "EP",
      "validity": "valid",
      "preconditions": ["Application is accessible at the base URL", "Valid user account exists"],
      "test_data": {"Username": "john.doe@example.com", "Password": "Password@123"},
      "steps": [
        {"step_no": 1, "action": "Navigate to the Login page.", "expected_result": "Login page is displayed with Username and Password fields."},
        {"step_no": 2, "action": "Enter valid username and password.", "expected_result": "Credentials are accepted in the respective fields."},
        {"step_no": 3, "action": "Click the Login button.", "expected_result": "User is redirected to the Dashboard. Session is created."}
      ],
      "post_conditions": "User session is active. User is on the Dashboard page.",
      "automation_tags": ["Regression", "Smoke", "Functional"],
      "expected_api": "POST /api/auth/login",
      "expected_status_code": "200",
      "expected_db_validation": "Session record is created in the sessions table.",
      "traceability": "REQ-AUTH-001",
      "owner": "QA Team"
    }
  ],
  "summary": {
    "total_test_cases": 10,
    "module": "Authentication",
    "feature": "Login",
    "techniques_applied": ["EP", "BVA", "Security"],
    "categories_covered": ["Happy Path", "Negative", "Boundary", "Security"],
    "automation_count": {"Yes": 8, "No": 2},
    "compatible_tools": ["JIRA Zephyr Scale", "Azure DevOps", "TestRail"]
  }
}"""


def run(requirement_text: str, options: Dict[str, Any] = {}) -> Dict[str, Any]:
    messages = [
        {"role": "system", "content": PROMPT},
        {"role": "user", "content": (
            f"Generate enterprise test cases for:\n\n{requirement_text[:3000]}\n\n"
            "Infer Module, Feature, and Requirement IDs from the description. "
            "Cover Functional, Negative, Boundary, Security, Accessibility, and Performance types."
        )},
    ]
    result = chat(messages, temperature=0.2, max_tokens=4000, json_mode=True)
    try:
        data = json.loads(result["answer"])
        tc = data.get("test_cases", [])
        if isinstance(tc, list) and tc and not data.get("summary"):
            categories = sorted({c.get("category", "") for c in tc if c.get("category")})
            techniques = sorted({c.get("technique", "") for c in tc if c.get("technique")})
            auto_yes = sum(1 for c in tc if c.get("automation") == "Yes")
            data["summary"] = {
                "total_test_cases": len(tc),
                "module": tc[0].get("module", ""),
                "feature": tc[0].get("feature", ""),
                "techniques_applied": techniques,
                "categories_covered": categories,
                "automation_count": {"Yes": auto_yes, "No": len(tc) - auto_yes},
                "compatible_tools": ["JIRA Zephyr Scale", "Azure DevOps", "TestRail"],
            }
    except Exception:
        data = {"test_cases": [], "summary": {}, "raw": result["answer"]}
    return {**data, "tokens_used": result["tokens_used"], "latency_ms": result["latency_ms"]}
