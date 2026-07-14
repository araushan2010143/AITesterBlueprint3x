"""
Legacy Test Automation Migration Engine — V1

5-stage agent chain:
  Stage 1: Framework Detection      → language, framework, patterns, complexity
  Stage 2: Code Parsing             → Intermediate Representation (IR)
  Stage 3: Business Logic           → user intent, impact, journey per test
  Stage 4: POM Generation           → BasePage.ts + per-page TypeScript classes
  Stage 5: Playwright Synthesis     → spec.ts + confidence score + issues

Supported inputs:
  Java (Selenium, TestNG, JUnit), C# (NUnit, MSTest, SpecFlow), Python (Selenium, pytest),
  Robot Framework, Cucumber/Gherkin, JavaScript/TypeScript Selenium
"""
import json
import re
import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

# ── Stage 1: Framework Detection ──────────────────────────────────────────────

_S1 = """You are a senior QA architect. Analyze the legacy test automation code below.

Identify:
1. language  — Java | C# | Python | JavaScript | TypeScript | Ruby | Robot | Gherkin | other
2. framework — Selenium | TestNG | JUnit | NUnit | MSTest | SpecFlow | Cucumber | Robot Framework | PyTest | WebdriverIO | Cypress | other
3. patterns  — array of: Page Object Model | Keyword Driven | Data Driven | BDD | Hybrid | none
4. build_tool — Maven | Gradle | dotnet | pip | npm | unknown
5. test_count — estimated number of test methods / test cases (integer)
6. complexity — "low" | "medium" | "high"
7. challenges — array of specific migration risks found in this code (e.g. "Thread.sleep() calls", "brittle XPath", "hardcoded URLs")
8. confidence — integer 0-100 for how certain you are of the detection

Return ONLY valid JSON, no markdown, no commentary:
{
  "language": "Java",
  "framework": "Selenium + TestNG",
  "patterns": ["Page Object Model"],
  "build_tool": "Maven",
  "test_count": 4,
  "complexity": "medium",
  "challenges": ["Thread.sleep() calls detected", "Brittle XPath locators"],
  "confidence": 94
}

SOURCE CODE:
"""

# ── Stage 2: Code Parsing → IR ────────────────────────────────────────────────

_S2 = """You are a test automation parser. Convert the legacy test code into a structured Intermediate Representation (IR).

Extract:
- pages: group locators by logical page or component
- locators: for each locator found, its name, selector type, raw value, and the original source expression
- tests: each test method as an ordered list of steps

Step actions must be one of:
  navigate | click | fill | assert_text | assert_visible | assert_url | assert_value |
  wait_for | hover | select | upload | scroll | press_key | clear | double_click |
  right_click | drag_drop | get_text | check | uncheck

Return ONLY valid JSON:
{
  "pages": [
    {
      "name": "LoginPage",
      "locators": [
        { "name": "usernameInput", "type": "id", "value": "username", "original": "By.id(\\"username\\")" },
        { "name": "passwordInput", "type": "css", "value": "input[type='password']", "original": "By.cssSelector(...)" },
        { "name": "loginButton",   "type": "xpath", "value": "//button[@type='submit']", "original": "By.xpath(...)" }
      ]
    }
  ],
  "tests": [
    {
      "name": "should login with valid credentials",
      "original_name": "testValidLogin",
      "page": "LoginPage",
      "steps": [
        { "action": "navigate",       "target": "https://example.com/login", "value": "" },
        { "action": "fill",           "target": "usernameInput",             "value": "admin@test.com" },
        { "action": "fill",           "target": "passwordInput",             "value": "Password123" },
        { "action": "click",          "target": "loginButton",               "value": "" },
        { "action": "assert_url",     "target": "",                          "value": "/dashboard" }
      ],
      "test_data": { "username": "admin@test.com", "password": "Password123" }
    }
  ]
}

SOURCE CODE:
"""

# ── Stage 3: Business Logic Extraction ────────────────────────────────────────

_S3 = """You are a business analyst and QA architect. Given the original source code and its IR, describe the BUSINESS INTENT of each test — what real user scenario or business rule is being validated, not just what the code does.

Also surface:
- business_impact: "critical" | "high" | "medium" | "low"
- type: "happy_path" | "negative" | "edge_case" | "regression" | "smoke" | "e2e"
- user_journey: short description of the user's path
- coverage_gaps: business flows that are NOT tested but should be
- migration_notes: things the migration must preserve

Return ONLY valid JSON:
{
  "business_flows": [
    {
      "test_name": "should login with valid credentials",
      "intent": "Validates that a registered user can authenticate with correct credentials and land on the dashboard",
      "business_impact": "critical",
      "type": "happy_path",
      "user_journey": "Enter credentials → Submit → Reach dashboard"
    }
  ],
  "coverage_gaps": ["No test for invalid password", "No session timeout scenario"],
  "migration_notes": ["Preserve parameterised login data — important for data-driven coverage"]
}

ORIGINAL CODE + IR:
"""

# ── Stage 4: POM Generation ───────────────────────────────────────────────────

_S4 = """You are a senior Playwright TypeScript developer. Generate clean, production-ready Page Object Model classes.

Rules:
- BasePage wraps `Page` from `@playwright/test`
- Each page class extends BasePage
- Use `page.locator()` — prefer CSS over XPath; keep xpath as: `page.locator('xpath=...')`
- Locators are readonly class properties (no getters)
- Methods are async, typed, return Promise<void> or Promise<string>
- Zero hard-coded waits — Playwright auto-waits by default
- Include a constructor(page: Page) calling super(page)
- Export every class

Return ONLY valid JSON — escape all newlines as \\n, all quotes inside strings as \\\":
{
  "base_page": "import { Page } from '@playwright/test';\\n\\nexport class BasePage {\\n  readonly page: Page;\\n  constructor(page: Page) { this.page = page; }\\n  async navigate(url: string) { await this.page.goto(url); }\\n  async waitForLoad() { await this.page.waitForLoadState('networkidle'); }\\n}\\n",
  "page_objects": [
    {
      "filename": "LoginPage.ts",
      "class_name": "LoginPage",
      "content": "import { Page } from '@playwright/test';\\nimport { BasePage } from './BasePage';\\n\\nexport class LoginPage extends BasePage {\\n  readonly usernameInput = this.page.locator('#username');\\n  readonly passwordInput = this.page.locator(\\"input[type='password']\\");\\n  readonly loginButton   = this.page.locator(\\"button[type='submit']\\");\\n\\n  async login(username: string, password: string) {\\n    await this.usernameInput.fill(username);\\n    await this.passwordInput.fill(password);\\n    await this.loginButton.click();\\n  }\\n}\\n"
    }
  ]
}

IR + BUSINESS FLOWS:
"""

# ── Stage 5: Playwright Synthesis ─────────────────────────────────────────────

_S5 = """You are a senior Playwright TypeScript test engineer. Write the final production-ready spec file.

Rules:
- `import { test, expect } from '@playwright/test'`
- Import page objects from './pages/PageName'
- `test.describe()` groups by feature / user journey
- `test.beforeEach()` for navigation / setup shared across tests
- Human-readable test names (what the user does, not what the code does)
- Playwright assertions only: `expect(locator).toBeVisible()` `.toHaveText()` `.toHaveURL()` `.toHaveValue()` etc.
- NEVER use `waitForTimeout()` or `sleep()`
- Use `test.each()` for data-driven tests
- Add short JSDoc comments for complex flows

Also return:
- confidence_score (0-100): how faithfully the migration preserves business intent
- issues: array of migration warnings / suggestions
- migration_summary: one paragraph for humans

Return ONLY valid JSON — escape all newlines as \\n:
{
  "spec_ts": "import { test, expect } from '@playwright/test';\\n...",
  "confidence_score": 88,
  "issues": [
    { "severity": "warning", "message": "XPath on LoginPage.loginButton converted to CSS — verify selector uniqueness in your app" },
    { "severity": "info",    "message": "3x Thread.sleep() calls replaced with Playwright auto-waiting" }
  ],
  "migration_summary": "Migrated 4 Selenium Java TestNG tests to Playwright TypeScript with full POM. High confidence on happy-path tests. One XPath locator flagged for manual review."
}

BUSINESS FLOWS + PAGE OBJECTS:
"""


def _chat(router: Any, prompt: str, user_content: str, max_tokens: int = 4096) -> Dict[str, Any]:
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert test automation architect. "
                "Return ONLY valid JSON — no markdown fences, no extra text."
            ),
        },
        {"role": "user", "content": prompt + "\n\n" + user_content},
    ]
    result = router.chat(messages, temperature=0.1, max_tokens=max_tokens, json_mode=True)
    raw = result.get("answer", result.get("content", result.get("text", "{}")))
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw.strip())
    return json.loads(raw)


def _safe(fn, fallback):
    try:
        return fn()
    except Exception as e:
        logger.warning("Migration stage error: %s", e)
        return fallback


def run(content: str, options: Dict[str, Any] = {}) -> Dict[str, Any]:
    """Run the 5-stage migration pipeline. Returns a rich result dict."""
    from backend.llm.router import get_router
    router = get_router()

    chat = lambda prompt, ctx, max_t=4096: _chat(router, prompt, ctx, max_t)

    # Stage 1 ─────────────────────────────────────────────────────────────────
    logger.info("Migration Stage 1: Framework Detection")
    detection = _safe(lambda: chat(_S1, content, 1024), {
        "language": "Unknown", "framework": "Unknown", "patterns": [],
        "build_tool": "unknown", "test_count": 0, "complexity": "medium",
        "challenges": [], "confidence": 0,
    })

    # Stage 2 ─────────────────────────────────────────────────────────────────
    logger.info("Migration Stage 2: Code Parsing → IR")
    ir = _safe(lambda: chat(_S2, content, 3500), {"pages": [], "tests": []})

    s2_ctx = f"ORIGINAL CODE:\n{content[:3000]}\n\nPARSED IR:\n{json.dumps(ir, indent=2)[:3000]}"

    # Stage 3 ─────────────────────────────────────────────────────────────────
    logger.info("Migration Stage 3: Business Logic Extraction")
    business = _safe(lambda: chat(_S3, s2_ctx, 2048), {
        "business_flows": [], "coverage_gaps": [], "migration_notes": [],
    })

    s3_ctx = (
        f"IR:\n{json.dumps(ir, indent=2)[:2000]}\n\n"
        f"BUSINESS FLOWS:\n{json.dumps(business, indent=2)[:2000]}"
    )

    # Stage 4 ─────────────────────────────────────────────────────────────────
    logger.info("Migration Stage 4: Page Object Generation")
    pom = _safe(lambda: chat(_S4, s3_ctx, 4096), {"base_page": "", "page_objects": []})

    s4_ctx = (
        f"BUSINESS FLOWS:\n{json.dumps(business, indent=2)[:2000]}\n\n"
        f"PAGE OBJECTS GENERATED:\n{json.dumps(pom, indent=2)[:2000]}"
    )

    # Stage 5 ─────────────────────────────────────────────────────────────────
    logger.info("Migration Stage 5: Playwright TypeScript Synthesis")
    synthesis = _safe(lambda: chat(_S5, s4_ctx, 4096), {
        "spec_ts": "", "confidence_score": 0, "issues": [],
        "migration_summary": "Migration could not complete — check input format.",
    })

    return {
        "source_analysis": detection,
        "ir": ir,
        "business_flows": business,
        "page_objects": pom,
        "spec_ts": synthesis.get("spec_ts", ""),
        "confidence_score": synthesis.get("confidence_score", 0),
        "issues": synthesis.get("issues", []),
        "migration_summary": synthesis.get("migration_summary", ""),
    }
