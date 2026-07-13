"""Shared fixtures for unit and integration tests."""
import pytest

JUNIT_XML_SINGLE = """<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="LoginTests" tests="3" failures="2" errors="0" time="12.3">
  <testcase name="valid credentials" classname="LoginTests" time="2.1"/>
  <testcase name="invalid password" classname="LoginTests" time="1.8">
    <failure message="Expected error toast not found">
      TimeoutError: waitForSelector('.error-toast') exceeded 5000ms
    </failure>
  </testcase>
  <testcase name="locked account" classname="LoginTests" time="3.2">
    <failure message="Account not locked after 5 attempts">
      AssertionError: expected status 423, got 200
    </failure>
  </testcase>
</testsuite>"""

JUNIT_XML_NESTED = """<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Auth" tests="2" failures="1">
    <testcase name="login" classname="Auth" time="1.0"/>
    <testcase name="logout" classname="Auth" time="0.8">
      <failure message="Session not cleared">Cookie still present after logout</failure>
    </testcase>
  </testsuite>
  <testsuite name="Cart" tests="1" failures="1">
    <testcase name="add item" classname="Cart" time="2.3">
      <error message="NullPointerException">java.lang.NullPointerException at CartPage.java:42</error>
    </testcase>
  </testsuite>
</testsuites>"""

PLAYWRIGHT_JSON_SINGLE = """{
  "suites": [
    {
      "title": "Auth",
      "specs": [
        {
          "title": "login with valid credentials",
          "tests": [{"projectName": "chromium", "results": [{"status": "passed", "retry": 0, "error": {}}]}]
        },
        {
          "title": "login with invalid password",
          "tests": [{"projectName": "chromium", "results": [{"status": "failed", "retry": 0, "error": {"message": "TimeoutError: spinner still visible after 8000ms"}}]}]
        }
      ],
      "suites": []
    }
  ],
  "stats": {"expected": 1, "unexpected": 1, "skipped": 0}
}"""

PLAYWRIGHT_JSON_RETRIES = """{
  "suites": [
    {
      "title": "Checkout",
      "specs": [
        {
          "title": "pay with saved card",
          "tests": [{
            "projectName": "chromium",
            "results": [
              {"status": "failed", "retry": 0, "error": {"message": "Network timeout"}},
              {"status": "passed", "retry": 1, "error": {}}
            ]
          }]
        }
      ],
      "suites": []
    }
  ],
  "stats": {"expected": 0, "unexpected": 1, "skipped": 0}
}"""

MOCK_STAGE1_RESPONSE = {
    "tests": [
        {
            "name": "LoginTests › invalid password",
            "failure_category": "Automation Bug",
            "confidence": 88,
            "pass_rate": "0%",
            "run_history": ["FAIL", "FAIL", "FAIL"],
            "root_causes": [
                {"cause": "Automation Bug", "probability": 85, "evidence": "Wrong selector for error toast"},
                {"cause": "Timing Issue", "probability": 15, "evidence": "Toast appears after timeout"},
            ],
            "priority": "High",
            "estimated_fix_time": "30m",
        }
    ],
    "summary": {
        "total_tests": 3,
        "builds_analyzed": 1,
        "categories": {"Automation Bug": 1, "Timing Issue": 0, "Product Bug": 0},
        "most_common_category": "Automation Bug",
        "prod_readiness_score": 67,
    },
    "release_gate": {"decision": "Conditional", "reason": "1 automation bug found."},
}

MOCK_STAGE2_RESPONSE = {
    "fixes": {
        "LoginTests › invalid password": {
            "description": "Replace brittle CSS selector with data-testid",
            "before": "await page.waitForSelector('.error-toast');",
            "after": "await expect(page.locator('[data-testid=\"error-toast\"]')).toBeVisible();",
        }
    },
    "ai_report": {
        "executive_summary": "Suite has 1 automation bug causing consistent failures.",
        "top_recommendation": "Fix the error-toast selector to use data-testid.",
        "defect_breakdown": "1 automation bug, 0 product bugs, 0 infrastructure issues.",
    },
}
