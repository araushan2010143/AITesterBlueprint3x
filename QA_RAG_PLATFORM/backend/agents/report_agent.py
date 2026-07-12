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

TEST_DATA_PROMPT = """You are a senior QA engineer applying production-grade, multi-technique test data generation.

== TECHNIQUES TO APPLY ==
1. Boundary Value Analysis (BVA): test at exact min, min-1, min+1, max-1, max, max+1 for each length/range constraint
2. Equivalence Partitioning (EP): 1 representative from each valid partition, 1-2 from each invalid partition
3. Error Guessing: reserved words (admin, root, null, undefined, true, false), existing/duplicate values, common typos
4. Security — SQL Injection: ' OR 1=1 --, UNION SELECT, boolean-based, time-based (1 per attack type)
5. Security — XSS: <script>alert(1)</script>, event handler injection, img onerror (1-2 representatives)
6. Security — HTML Injection: <h1>test</h1>, <a href=x>click</a>
7. Unicode/I18n: 1 per script family — Hindi/Devanagari, Chinese/CJK, Arabic (RTL), Cyrillic, Emoji
8. Whitespace: empty string, single space, leading space, trailing space, multiple internal spaces, tab character
9. Semantic Validation: syntactically valid but semantically wrong (future DOB, negative price, past expiry date)
10. Performance: 1 very long string — write exactly 60 letter 'a' characters (NOT .repeat(), NOT + operator)

== REPRESENTATIVE DATA MATRIX — cover all 17 categories ==
Empty | Space | Alphabetic | Numeric | AlphaNumeric | Special Chars | Unicode | Emoji |
SQL Injection | HTML Injection | XSS | Long Text (60 chars) | Max Length | Above Max | Leading Space | Trailing Space | Multiple Spaces

== INTELLIGENT DEDUPLICATION RULES ==
- Alphabetic "JohnDoe" and "AliceSmith" represent the same equivalence class — keep only ONE
- SQL injection ' OR 1=1 -- and '; DROP TABLE -- are different attack types — keep BOTH
- XSS <script>alert(1)</script> and onload=alert(1) are different vectors — keep BOTH
- For each field, target 25-40 total test cases covering as many categories as possible
- BVA values are always unique — never merge boundary values with each other

== ABSOLUTE RULES ==
- Return ONLY valid JSON — no markdown fences (no ```), no explanation text outside the JSON
- ALL values must be plain JSON strings or numbers — NEVER JavaScript expressions like .repeat(), +, concat()
- For the "Long Text" category, write 60 actual 'a' characters: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
- For "Max Length", infer a reasonable max (e.g., 50 chars for username) and write exactly that many characters
- For "Above Max", write max+1 characters

== OUTPUT FORMAT ==
{
  "test_cases": [
    {
      "id": "TC001",
      "field": "username",
      "category": "Empty",
      "value": "",
      "technique": "EP",
      "validity": "invalid",
      "expected_result": "Validation error: field is required",
      "priority": "Critical",
      "risk": "User registration blocked"
    },
    {
      "id": "TC002",
      "field": "username",
      "category": "Alphabetic",
      "value": "JohnDoe",
      "technique": "EP",
      "validity": "valid",
      "expected_result": "Accepted",
      "priority": "High",
      "risk": "Happy path must work"
    }
  ],
  "summary": {
    "total_test_cases": 35,
    "fields_covered": ["username", "email"],
    "techniques_applied": ["BVA", "EP", "Error Guessing", "Security", "Unicode", "Whitespace", "Semantic"],
    "categories_covered": ["Empty", "Space", "Alphabetic", "Numeric", "AlphaNumeric", "Special Chars", "Unicode", "Emoji", "SQL Injection", "XSS", "HTML", "Long Text", "Max Length", "Above Max", "Leading Space", "Trailing Space", "Multiple Spaces"],
    "deduplication_applied": true
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
             f"Generate production-grade test data applying all 10 techniques for:\n\n{content[:3000]}\n\n"
             "Cover all 17 representative categories from the matrix. Apply intelligent deduplication."
         )}],
        temperature=0.3, max_tokens=4096, json_mode=True
    )
    try:
        data = json.loads(result["answer"])
        # Auto-fill summary from generated cases when the LLM omits it
        tc = data.get("test_cases", [])
        if isinstance(tc, list) and tc and not data.get("summary"):
            categories = sorted({c.get("category", "") for c in tc if c.get("category")})
            techniques = sorted({c.get("technique", "") for c in tc if c.get("technique")})
            fields = sorted({c.get("field", "") for c in tc if c.get("field")})
            data["summary"] = {
                "total_test_cases": len(tc),
                "fields_covered": fields,
                "techniques_applied": techniques,
                "categories_covered": categories,
                "deduplication_applied": True,
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
