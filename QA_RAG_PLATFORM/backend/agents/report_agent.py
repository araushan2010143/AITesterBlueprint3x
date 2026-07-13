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

SCRIPT_PROMPT = """You are a senior automation engineer. Generate a complete, runnable {framework} test script.

Rules:
- Write the FULL script — no placeholders, no "..." truncations
- Use realistic selectors and assertions
- Include imports, setup, and teardown
- Output ONLY the raw code — no JSON wrapper, no markdown fences, no explanation

Start your response with the first line of code."""

POSTMAN_PROMPT = """You are a senior QA engineer. Generate a Postman Collection v2.1 JSON for the given test case.

Output ONLY the raw Postman collection JSON — no markdown fences, no explanation, no wrapper.
Start your response with the opening {{ character."""

TEST_DATA_PROMPT = """You are a senior QA engineer writing industry-standard test cases compatible with JIRA Zephyr Scale, Azure DevOps Test Plans, TestRail, and enterprise test management tools.

== NAMING CONVENTION ==
TC_<MODULE>_<FEATURE>_<CATEGORY>_<SEQ>
Examples: TC_AUTH_LOGIN_EMPTY_001, TC_AUTH_LOGIN_SQL_002, TC_REGISTER_EMAIL_XSS_001

== STEP WRITING RULES ==
- Actions in imperative form: "Navigate to...", "Enter...", "Click...", "Verify..."
- 3-5 steps per test case: (1) Navigate, (2) Set up pre-state, (3) Enter test value, (4) Trigger action, (5) Verify outcome
- Expected Results must be observable and measurable — never "works correctly"
- Test Data (values) go in the test_data field, NOT embedded in steps

== COVERAGE REQUIREMENTS — generate 1 test case per category ==
Empty | Space | Alphabetic | Numeric | AlphaNumeric | Special Chars | Unicode |
Emoji | SQL Injection | HTML Injection | XSS | Long Text | Max Length | Above Max |
Leading Space | Trailing Space | Multiple Spaces | Valid Happy Path

== TECHNIQUES: BVA, EP, Security, Unicode, Whitespace, Error Guessing, Performance ==

== ABSOLUTE RULES ==
- Return ONLY valid JSON — no markdown fences, no explanation outside JSON
- ALL string values must be plain JSON — NO JavaScript expressions (.repeat(), +, concat())
- For Long Text: write 60 actual letter 'a' characters
- For Max Length: write exactly the field's max allowed characters
- For Above Max: write max+1 characters
- Keep steps concise: action ≤ 12 words, expected_result ≤ 15 words
- Exactly 3 steps per test case — no more, no less
- Generate EXACTLY 10 test cases total covering the 10 most critical categories
- Preconditions: max 2 items
- automation_tags: max 3 tags

== OUTPUT FORMAT ==
{
  "test_cases": [
    {
      "id": "TC_AUTH_LOGIN_EMPTY_001",
      "summary": "Verify that login form displays required field error when username is left empty",
      "requirement_id": "REQ-AUTH-001",
      "module": "Authentication",
      "feature": "Login",
      "priority": "High",
      "severity": "Critical",
      "type": "Functional",
      "automation": "Yes",
      "category": "Empty",
      "technique": "EP",
      "validity": "invalid",
      "preconditions": [
        "Application is accessible at the base URL",
        "Login page is loaded in browser"
      ],
      "test_data": {
        "Username": "(empty string)",
        "Password": "Password@123"
      },
      "steps": [
        {
          "step_no": 1,
          "action": "Navigate to the Login page.",
          "expected_result": "Login page is displayed with Username and Password input fields."
        },
        {
          "step_no": 2,
          "action": "Leave the Username field empty.",
          "expected_result": "Username field remains empty with no pre-filled value."
        },
        {
          "step_no": 3,
          "action": "Enter a valid password 'Password@123' in the Password field.",
          "expected_result": "Password is masked and accepted in the Password field."
        },
        {
          "step_no": 4,
          "action": "Click the Login button.",
          "expected_result": "Validation error message 'Username is required' is displayed. User remains on the Login page. No session is created."
        }
      ],
      "post_conditions": "No user session is created. User remains on the Login page.",
      "automation_tags": ["Regression", "Negative", "Functional"],
      "expected_api": "POST /api/auth/login",
      "expected_status_code": "400",
      "expected_db_validation": "No session record is created in the sessions table.",
      "traceability": "REQ-AUTH-001",
      "owner": "QA Team"
    }
  ],
  "summary": {
    "total_test_cases": 18,
    "module": "Authentication",
    "feature": "Login",
    "techniques_applied": ["BVA", "EP", "Security", "Unicode", "Whitespace", "Error Guessing"],
    "categories_covered": ["Empty", "Space", "Alphabetic", "SQL Injection", "XSS"],
    "automation_count": {"Yes": 15, "No": 3},
    "compatible_tools": ["JIRA Zephyr Scale", "Azure DevOps", "TestRail"]
  }
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


_FW_EXT = {
    "Playwright TypeScript":  "spec.ts",
    "Playwright JavaScript":  "spec.js",
    "Cypress JavaScript":     "cy.js",
    "WebdriverIO TypeScript": "test.ts",
    "Selenium Java":          "Test.java",
    "Selenium Python":        "test.py",
    "REST Assured Java":      "ApiTest.java",
    "Axios Jest TypeScript":  "api.test.ts",
    "Supertest JavaScript":   "api.test.js",
    "Postman Collection":     "postman_collection.json",
}


def _strip_fences(text: str) -> str:
    """Remove markdown code fences if the LLM wrapped the output in them."""
    import re
    # Strip ```lang ... ``` or ``` ... ```
    stripped = re.sub(r"^```[a-zA-Z]*\n?", "", text.strip())
    stripped = re.sub(r"\n?```$", "", stripped.strip())
    return stripped.strip()


def run_generate_script(content: str, options: Dict[str, Any] = {}) -> Dict[str, Any]:
    framework = options.get("framework", "Playwright TypeScript")
    ext = _FW_EXT.get(framework, "txt")
    filename = f"test_login.{ext}"

    if framework == "Postman Collection":
        sys_prompt = POSTMAN_PROMPT
    else:
        sys_prompt = SCRIPT_PROMPT.format(framework=framework, ext=ext)

    # No json_mode — ask for raw code directly so small models don't return null
    result = chat(
        [{"role": "system", "content": sys_prompt},
         {"role": "user", "content": f"Test case to automate:\n{content[:3000]}"}],
        temperature=0.2, max_tokens=4096, json_mode=False,
    )

    raw = result["answer"] or ""
    script = _strip_fences(raw)

    return {
        "script": script,
        "filename": filename,
        "framework": framework,
        "tokens_used": result["tokens_used"],
        "latency_ms": result["latency_ms"],
    }


def run_test_data(content: str, options: Dict[str, Any] = {}) -> Dict[str, Any]:
    result = chat(
        [{"role": "system", "content": TEST_DATA_PROMPT},
         {"role": "user", "content": (
             f"Generate industry-standard test cases for:\n\n{content[:3000]}\n\n"
             "Infer the Module, Feature, and Requirement IDs from the description. "
             "Cover all 18 categories (Empty through Valid Happy Path). "
             "Write proper multi-step test cases with preconditions, test data, and post conditions."
         )}],
        temperature=0.2, max_tokens=12000, json_mode=True
    )
    try:
        data = json.loads(result["answer"])
        # Auto-fill summary when LLM omits it
        tc = data.get("test_cases", [])
        if isinstance(tc, list) and tc and not data.get("summary"):
            categories = sorted({c.get("category", "") for c in tc if c.get("category")})
            techniques = sorted({c.get("technique", "") for c in tc if c.get("technique")})
            auto_yes = sum(1 for c in tc if c.get("automation") == "Yes")
            auto_no = len(tc) - auto_yes
            data["summary"] = {
                "total_test_cases": len(tc),
                "module": tc[0].get("module", ""),
                "feature": tc[0].get("feature", ""),
                "techniques_applied": techniques,
                "categories_covered": categories,
                "automation_count": {"Yes": auto_yes, "No": auto_no},
                "compatible_tools": ["JIRA Zephyr Scale", "Azure DevOps", "TestRail"],
            }

        # Ensure test_cases is always a list even if model returns wrapped structure
        if "test_data" in data and "test_cases" not in data:
            # Legacy format fallback — convert to flat list
            td = data["test_data"]
            cases = []
            tc_id = 1
            for cat, items in td.items():
                if not isinstance(items, list):
                    continue
                for item in items:
                    val = item if not isinstance(item, dict) else json.dumps(item)
                    cases.append({
                        "id": f"TC{tc_id:03d}", "field": "input",
                        "category": cat.replace("_", " ").title(),
                        "value": str(val), "technique": "EP",
                        "validity": "valid" if "valid" in cat else "invalid",
                        "expected_result": "Refer to test case", "priority": "Medium", "risk": ""
                    })
                    tc_id += 1
            data["test_cases"] = cases
    except Exception:
        data = {"test_cases": [], "raw": result["answer"]}
    return {**data, "tokens_used": result["tokens_used"], "latency_ms": result["latency_ms"]}
