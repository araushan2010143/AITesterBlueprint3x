"""
Enterprise Automation Pipeline Agent
Converts manual test cases (JIRA/ADO/CSV/plain text) into production-ready
Playwright BDD automation following the POM pattern.

Supported frameworks:
  ts_cucumber  → Playwright TypeScript + Cucumber + POM  (default)
  py_behave    → Playwright Python   + Behave    + POM + BasePage + Assertions

Pipeline (3 chained LLM calls):
  Stage 1 → Enterprise BDD Feature Engineering (10 Rules Decision Engine)
  Stage 2 → Step definitions (language-specific)
  Stage 3 → Page Object + Locators (+ BasePage + Assertions for Python)
"""
import json
import time
from typing import Any, Dict, List
from backend.llm.groq_llm import chat

# ── Quality level hints ────────────────────────────────────────────────────────

_L1_HINT = "Generate SKELETON code only — empty method bodies with // TODO comments."
_L2_HINT = "Generate FUNCTIONAL code — working Playwright code, proper selectors, assertions."
_L3_HINT = (
    "Generate ENTERPRISE code — use WaitHelper, Logger, retry logic, "
    "API interception where useful, custom error messages, screenshot on failure."
)
_L3_UTILS = """
// Available enterprise utilities:
// import { Logger } from '../utils/Logger';
// import { WaitHelper } from '../utils/WaitHelper';
// Logger.info('message') — structured logging
// WaitHelper.waitForElement(page, locator, timeout?) — retry-safe element wait
// WaitHelper.waitForNetwork(page, url?) — wait for specific network call
"""


# ── Stage 1: Enterprise BDD Feature Engineering ────────────────────────────────

_BDD_PROMPT = """You are an Enterprise BDD Feature Architect applying the 10 Enterprise BDD Design Rules.
Transform manual test cases into optimised, maintainable Gherkin feature files.

== THE 10 ENTERPRISE BDD RULES ==

== CRITICAL DATA PARAMETERISATION RULE (applies BEFORE all other rules) ==
NEVER hardcode test data (usernames, passwords, emails, IDs, URLs, amounts) as string literals inside step text.

❌ WRONG — hardcoded, not parameterised:
  When User enters username "admin"
  And User enters password "ValidPass123"

✅ CORRECT — Scenario Outline with Examples table (even for a single data row):
  When User logs in with "<username>" and "<password>"
  Then "<expected_result>" should be displayed

  Examples:
    | username | password     | expected_result |
    | admin    | ValidPass123 | Dashboard       |

If there is ONLY ONE test case with credentials/data → still use Scenario Outline with one Examples row.
Sensitive data (passwords, tokens, API keys) go into the Examples table — never inline in step text.
The Examples table acts as the contract: values can be replaced by test data config, CI variables, or Vault secrets.

==============================================================================

RULE 1 — SCENARIO vs SCENARIO OUTLINE
• Any step containing inline data (strings, numbers, emails, IDs) → MUST become Scenario Outline
• Same business flow + multiple data rows → Scenario Outline + Examples table
• Different business flows (Login vs Logout vs Register) → separate Scenarios, NEVER combine in one Outline
• Only use plain Scenario when there is NO data variation AND no inline values in steps

RULE 2 — BACKGROUND
• If 2+ scenarios share identical opening Given steps → extract those steps to Background:
• Business-readable preconditions ONLY (e.g. "Given User is on the Login page")
• Skip Background if only one scenario shares the setup

RULE 3 — PRECONDITION CLASSIFICATION
• Environment / technical (QA env running, DB seeded, API mocked) → hooks/fixtures, NOT in Gherkin
• Test data ("user account exists in DB") → test data factory, NOT in Gherkin
• Business context ("User is already logged in") → Given step ✓

RULE 4 — DATATABLES vs EXAMPLES
• Examples = same scenario runs multiple times; each row = one independent test execution
• DataTable = structured multi-field input within ONE execution (registration form, bulk import)

RULE 5 — BUSINESS LANGUAGE (NON-NEGOTIABLE)
• NEVER: "click button", "enter text", "type into field", "locate element", "select from dropdown"
• ALWAYS: "User logs in", "User searches for product", "User completes checkout", "User submits form"
• Describe WHAT the user achieves — not HOW the UI implements it

RULE 6 — SMART TAG INFERENCE
• Priority: @P1 (critical/blocker) / @P2 (high) / @P3 (medium)
• Suite: @Smoke @Regression @Sanity
• Domain: @Authentication @Payment @Cart @Search @Profile @Admin @Checkout
• Nature: @Positive @Negative @Boundary @Security @Accessibility
• Execution: @Automated @UI @API @Mobile

RULE 7 — FEATURE FILE SPLITTING
• One feature = one cohesive business capability
• Detect separate capabilities (Login ≠ Logout ≠ Registration) → generate separate .feature files
• Folder convention: features/<domain>/<capability>.feature

RULE 8 — STEP QUALITY
• Max 8 steps per scenario (prefer 4–6)
• One clear business objective per scenario — no multi-purpose scenarios
• Scenario names: describe the OUTCOME not the action ("Verify user accesses dashboard" not "Test login")

RULE 9 — SPECIFIC EXPECTED RESULTS (Then steps)
• Specific: "Then Dashboard page should be displayed" ✓
• Vague: "Then login should succeed" ✗
• Separate UI + API + business validations when relevant:
  Then Dashboard page should be displayed
  And User profile icon should be visible
  And Authentication API should return 200

RULE 10 — REUSABLE STEP PATTERNS
• Identical business action across scenarios → identical step text (enables step reuse)
• ALL data passed via "<param>" placeholders — never inline string literals in steps
• Examples table columns: use descriptive names (username, password, expected_result, email, amount)

RULE 11 — EXAMPLES TABLE DESIGN
• Always include at least 2 rows in Examples: one positive (happy path) + one negative/boundary
• Column names in Examples must match "<param>" names used in steps exactly
• For login: add rows for valid credentials + invalid credentials + boundary (empty fields)
• For forms: add rows for valid data + missing required field + invalid format
• Sensitive columns (password, token, api_key): mark with comment "# from test data config" in header row

== JSON OUTPUT (no markdown, no code fences) ==
{
  "bdd_analysis": {
    "scenario_type": "Scenario | Scenario Outline | Mixed",
    "has_background": true,
    "background_steps": ["User is on the Login page"],
    "has_examples": true,
    "has_datatables": false,
    "tags": ["@Smoke", "@Regression", "@Authentication", "@P1", "@Automated", "@UI"],
    "decisions": [
      "PARAMETERISATION: 'User enters username \"admin\"' converted to Scenario Outline with Examples — no hardcoded credentials in step text",
      "SCENARIO OUTLINE: Single test case with credentials data → Scenario Outline with 3 Examples rows (valid, invalid password, invalid user)",
      "BACKGROUND: 'User is on the Login page' repeated → extracted",
      "BUSINESS LANGUAGE: 'enter username/password' → 'User logs in with \"<username>\" and \"<password>\"'",
      "PRECONDITIONS: 'QA environment is running' classified as Hook — omitted from Gherkin"
    ],
    "quality_checks": [
      "Max 8 steps per scenario: ✓",
      "One business objective per scenario: ✓",
      "No hardcoded data in step text: ✓",
      "Parameterised via Examples table: ✓"
    ]
  },
  "feature_files": [
    {
      "filename": "login.feature",
      "path": "features/authentication/login.feature",
      "folder": "features/authentication",
      "content": "@Smoke @Regression @Authentication @P1 @Automated @UI\nFeature: Authentication — Login\n\n  As a registered user\n  I want to log in with my credentials\n  So that I can access the application\n\n  Background:\n    Given User is on the Login page\n\n  Scenario Outline: Verify login validation with <username>\n    When User logs in with \"<username>\" and \"<password>\"\n    Then \"<expected_message>\" should be displayed\n\n    Examples:\n      | username | password     | expected_message  |\n      | admin    | ValidPass123 | Dashboard         |\n      | admin    | wrongpass    | Invalid password  |\n      | unknown  | ValidPass123 | User not found    |"
    }
  ],
  "intent": {
    "module": "Authentication",
    "feature": "Login",
    "page_class": "LoginPage",
    "steps_file": "login.steps.ts",
    "feature_filename": "login.feature",
    "pom_filename": "LoginPage.ts",
    "locators_filename": "login.locators.ts",
    "base_url_path": "/login"
  }
}"""


def _stage1_bdd(content: str, quality_level: str) -> Dict[str, Any]:
    result = chat(
        [
            {"role": "system", "content": _BDD_PROMPT},
            {"role": "user", "content": (
                f"Manual test case(s) to analyse:\n\n{content[:2500]}\n\n"
                f"Quality level: {quality_level}\n"
                "Apply all 10 Enterprise BDD Rules. Return optimised feature file(s)."
            )},
        ],
        temperature=0.1,
        max_tokens=2500,
        json_mode=True,
    )
    try:
        data = json.loads(result["answer"])
        # Normalise: ensure feature_files is a list
        if "feature_files" not in data or not data["feature_files"]:
            # Fallback: wrap legacy feature_file string
            ff_content = data.get("feature_file", content)
            intent = data.get("intent", {})
            data["feature_files"] = [{
                "filename": intent.get("feature_filename", "feature.feature"),
                "path": f"features/{intent.get('module','app').lower()}/{intent.get('feature_filename','feature.feature')}",
                "folder": f"features/{intent.get('module','app').lower()}",
                "content": ff_content if isinstance(ff_content, str) else content,
            }]
        if "bdd_analysis" not in data:
            data["bdd_analysis"] = {
                "scenario_type": "Scenario",
                "has_background": False,
                "background_steps": [],
                "has_examples": False,
                "has_datatables": False,
                "tags": ["@Automated"],
                "decisions": [],
                "quality_checks": [],
            }
        return {**data, "tokens_used": result["tokens_used"]}
    except Exception:
        intent_fallback = {
            "module": "Application", "feature": "Feature",
            "page_class": "FeaturePage", "steps_file": "feature.steps.ts",
            "feature_filename": "feature.feature", "pom_filename": "FeaturePage.ts",
            "locators_filename": "feature.locators.ts", "base_url_path": "/",
        }
        return {
            "intent": intent_fallback,
            "bdd_analysis": {
                "scenario_type": "Scenario",
                "has_background": False, "background_steps": [],
                "has_examples": False, "has_datatables": False,
                "tags": ["@Automated"], "decisions": [],
                "quality_checks": [],
            },
            "feature_files": [{
                "filename": "feature.feature",
                "path": "features/app/feature.feature",
                "folder": "features/app",
                "content": content,
            }],
            "tokens_used": result["tokens_used"],
        }


# ── Stage 2: Step Definitions ──────────────────────────────────────────────────

_STEPS_PROMPT = """You are a senior Playwright + Cucumber automation engineer writing TypeScript step definitions.

== CRITICAL RULE — POM PATTERN ==
Step definition bodies MUST ONLY call Page Object methods.
NEVER use page.click(), page.fill(), page.goto(), page.locator(), expect() directly in steps.
The words 'page.', 'browser.', 'chromium.', 'await page' must NEVER appear inside a Given/When/Then body.
ALL Playwright interactions belong exclusively in the Page Object class.

== VARIABLE NAMING (Critical) ==
In BeforeAll:
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  page = await context.newPage();        ← this is Playwright's Page object
  loginPage = new LoginPage(page);       ← this is YOUR Page Object instance

Step bodies MUST call methods on the Page Object INSTANCE (loginPage / cartPage / etc.)
NEVER call methods on the Playwright `page` variable in steps.

== WRONG — 3 types of POM violations ==
// Type 1: Direct Playwright API
await page.fill('#username', 'admin');       // ❌ direct Playwright
// Type 2: Playwright method with different name (page is still Playwright Page)
await page.gotoLoginPage();                  // ❌ page.gotoLoginPage doesn't exist on Playwright Page
// Type 3: Playwright navigation
await page.goto('/login');                   // ❌ direct URL navigation in step

== CORRECT — all calls go through the Page Object instance ==
await loginPage.navigate();                  // ✅ POM method handles page.goto internally
await loginPage.enterCredentials(username, password);  // ✅ POM method handles page.fill
await loginPage.verifyDashboard();           // ✅ POM method handles expect()

== SCENARIO OUTLINE STEP PARAMETERS ==
When the feature has Scenario Outline with "<param>" placeholders:
• Use Cucumber expressions with {string}: When('User logs in with {string} and {string}', async (username: string, password: string) => {
• Params from Examples table become function arguments in order
• Pass params directly to POM methods: await loginPage.enterCredentials(username, password);
• For Then with param: Then('{string} should be displayed', async (message: string) => { await loginPage.verifyMessage(message); });
• For sensitive params (password, token): also support env var override:
  When('User logs in with {string} and {string}', async (username: string, password: string) => {
    await loginPage.enterCredentials(
      process.env[`TEST_${username.toUpperCase()}_USER`] ?? username,
      process.env.TEST_PASSWORD ?? password
    );
  });

== DATA PARAMETERISATION ENFORCEMENT ==
Step text must NEVER contain inline string values. All test data comes through:
• Scenario Outline Examples table → step function arguments (preferred)
• process.env.VAR_NAME — for CI/CD secrets (passwords, tokens, API keys)
• External test data files — for large datasets
If the feature file has inline strings in steps (e.g. 'User enters "admin"'), treat them as parameterised
arguments coming from the Examples table and declare the step with {string} Cucumber expressions.

== DATATABLE STEPS ==
When a step has a DataTable:
• Import: import { DataTable } from '@cucumber/cucumber';
• Key-value pairs: const data = dataTable.rowsHash();
• Column tables: const rows = dataTable.hashes();
• Example: When('User fills the registration form', async (dataTable: DataTable) => { const data = dataTable.rowsHash(); await page.fillForm(data); });

== BACKGROUND STEPS ==
• Implement Background Given steps as normal step definitions
• Cucumber automatically runs Background steps before each Scenario

== RULES ==
- Return ONLY valid JSON — no markdown fences
- steps_content: complete TypeScript file as a single escaped string
- Imports: @cucumber/cucumber (Given/When/Then/BeforeAll/AfterAll + DataTable if needed), Browser/Page types from @playwright/test, the Page Object class
- BeforeAll: launch browser → new context → new page → instantiate Page Object
- AfterAll: close browser
- Step text must match Gherkin word-for-word (including params as {string})
- Each Given/When/Then body: single await call to a POM method (1–2 lines max)
- JSDoc comment on each step (one line, business intent)

== OUTPUT ==
{
  "step_definitions": {
    "content": "full TypeScript content as escaped string",
    "filename": "login.steps.ts",
    "path": "src/steps/login.steps.ts"
  }
}"""


def _stage2_steps(
    original: str, intent: Dict, feature_files: List[Dict], quality_level: str
) -> Dict[str, Any]:
    page_class = intent.get("page_class", "Page")
    pom_file = intent.get("pom_filename", "Page.ts").replace(".ts", "")
    hint = {"L1": _L1_HINT, "L2": _L2_HINT, "L3": _L3_HINT}.get(quality_level, _L2_HINT)
    extra = _L3_UTILS if quality_level == "L3" else ""

    # Use first feature file as primary for step generation
    primary_feature = feature_files[0] if feature_files else {}
    feature_content = primary_feature.get("content", "")

    result = chat(
        [
            {"role": "system", "content": _STEPS_PROMPT},
            {"role": "user", "content": (
                f"Quality level: {quality_level} — {hint}\n{extra}\n\n"
                f"Page Object class: {page_class} (import from '../pages/{pom_file}')\n\n"
                f"Primary feature file:\n{feature_content}\n\n"
                f"Original test case:\n{original[:600]}"
            )},
        ],
        temperature=0.1,
        max_tokens=3500,
        json_mode=True,
    )
    try:
        data = json.loads(result["answer"])
        return {**data, "tokens_used": result["tokens_used"]}
    except Exception:
        return {
            "step_definitions": {
                "content": f"// Step definitions for {page_class}\n// Parse error — {result['answer'][:200]}",
                "filename": intent.get("steps_file", "feature.steps.ts"),
                "path": f"src/steps/{intent.get('steps_file', 'feature.steps.ts')}",
            },
            "tokens_used": result["tokens_used"],
        }


# ── Stage 3: Page Object + Locators ───────────────────────────────────────────

_POM_PROMPT = """You are a senior Playwright automation engineer writing TypeScript Page Object Model classes.

== RULES ==
- Return ONLY valid JSON — no markdown fences
- page_object.content and locators.content: TypeScript file contents as escaped strings
- Constructor takes Playwright Page as parameter
- All locators: private readonly Locator fields in constructor
  Priority: getByTestId() > getByRole() > getByLabel() > getByPlaceholder() > CSS [data-testid]
  NEVER use XPath, nth(), or positional selectors
- Each public method: one cohesive business action (enterUsername, clickLogin, verifyDashboard)
- Methods return Promise<void> or Promise<string>
- Assertions (expect) live in verify* methods inside the Page Object
- Parameterised methods: handle Scenario Outline params as method arguments

== SCENARIO OUTLINE SUPPORT ==
If the feature uses Scenario Outline with parameters like <username> and <password>:
• Corresponding POM methods MUST accept those as arguments:
  async enterCredentials(username: string, password: string): Promise<void>
• Verify methods with message param:
  async verifyMessage(expectedMessage: string): Promise<void>

== LOCATOR PRIORITY ==
1. data-testid: page.getByTestId('login-username')
2. ARIA role + name: page.getByRole('button', { name: 'Login' })
3. Label: page.getByLabel('Username')
4. Placeholder: page.getByPlaceholder('Enter password')
5. CSS as last resort: page.locator('[data-qa="login-btn"]')

== OUTPUT ==
{
  "page_object": {
    "content": "full TypeScript POM class as escaped string",
    "filename": "LoginPage.ts",
    "path": "src/pages/LoginPage.ts",
    "methods": ["navigate", "enterUsername", "enterPassword", "clickLogin", "verifyDashboard"]
  },
  "locators": {
    "content": "full TypeScript locators file as escaped string",
    "filename": "login.locators.ts",
    "path": "src/locators/login.locators.ts"
  }
}"""


def _stage3_pom(
    original: str, intent: Dict, feature_files: List[Dict],
    steps_content: str, quality_level: str
) -> Dict[str, Any]:
    page_class = intent.get("page_class", "Page")
    pom_file = intent.get("pom_filename", "Page.ts")
    loc_file = intent.get("locators_filename", "feature.locators.ts")
    hint = {"L1": _L1_HINT, "L2": _L2_HINT, "L3": _L3_HINT}.get(quality_level, _L2_HINT)
    extra = _L3_UTILS if quality_level == "L3" else ""

    primary_feature = feature_files[0] if feature_files else {}
    feature_content = primary_feature.get("content", "")

    result = chat(
        [
            {"role": "system", "content": _POM_PROMPT},
            {"role": "user", "content": (
                f"Quality level: {quality_level} — {hint}\n{extra}\n\n"
                f"Class: {page_class}  File: {pom_file}  Locators: {loc_file}\n"
                f"Base URL path: {intent.get('base_url_path', '/')}\n\n"
                f"Feature file:\n{feature_content}\n\n"
                f"Step definitions (for method signatures):\n{steps_content[:700]}\n\n"
                f"Original test case:\n{original[:500]}"
            )},
        ],
        temperature=0.1,
        max_tokens=3500,
        json_mode=True,
    )
    try:
        data = json.loads(result["answer"])
        return {**data, "tokens_used": result["tokens_used"]}
    except Exception:
        return {
            "page_object": {
                "content": f"// {page_class} — parse error\n// {result['answer'][:200]}",
                "filename": pom_file, "path": f"src/pages/{pom_file}", "methods": [],
            },
            "locators": {
                "content": "// locators — parse error",
                "filename": loc_file, "path": f"src/locators/{loc_file}",
            },
            "tokens_used": result["tokens_used"],
        }


# ── Stage 2 (Python): Behave Step Definitions ─────────────────────────────────

_STEPS_PROMPT_PY = """You are a senior Playwright Python + Behave automation engineer writing enterprise step definitions.

== ARCHITECTURE CONTEXT ==
Behave uses a shared `context` object across steps.
context.page        → Playwright Page (set in environment.py BeforeScenario)
context.login_page  → LoginPage instance (set in environment.py or BeforeScenario)
Step definitions ONLY call page object methods — NEVER call Playwright API directly.

== CRITICAL POM RULE ==
Steps must ONLY call Page Object methods via the context object.
NEVER use context.page.fill(), context.page.click(), context.page.goto(), context.page.locator() in step bodies.

== WRONG — POM violations ==
@when('User enters username "{username}"')
def step_enter_username(context, username):
    context.page.fill('#username', username)        # ❌ direct Playwright API
    context.page.get_by_test_id('user').fill(username)  # ❌ direct Playwright API

== CORRECT — delegate to Page Object ==
@when('User enters username "{username}"')
def step_enter_username(context, username):
    context.login_page.enter_username(username)     # ✅ POM method

== BEHAVE STEP SYNTAX ==
• Decorators: @given, @when, @then (import from behave)
• Function signature: def step_name(context, param1, param2): ...
• String parameters use quoted params: @when('User logs in with "{username}" and "{password}"')
• Sensitive params support env var override:
    username = os.environ.get(f'TEST_{username.upper()}_USER', username)
    password = os.environ.get('TEST_PASSWORD', password)
• Scenario Outline params auto-inject from Examples table — no extra code needed
• Background steps are regular @given steps; Behave calls them automatically

== PAGE OBJECT INITIALISATION ==
In environment.py (BeforeScenario hook — NOT in step files):
    context.login_page = LoginPage(context.page)
Step files only use context.login_page — never instantiate Page Objects in steps.

== OUTPUT ==
{
  "step_definitions": {
    "content": "complete Python file as an escaped string",
    "filename": "login_steps.py",
    "path": "steps/login_steps.py"
  }
}"""


_L1_HINT_PY = "Generate SKELETON — empty method bodies with # TODO comments."
_L2_HINT_PY = "Generate FUNCTIONAL code — working Playwright Python sync_api, proper selectors, assertions."
_L3_HINT_PY = (
    "Generate ENTERPRISE code — use Logger utility, retry_on_failure decorator, "
    "soft assertions, screenshot on failure, explicit wait helpers."
)
_L3_UTILS_PY = """
# Available enterprise utilities (Python):
# from utils.logger import Logger
# from utils.waits import wait_for_element, wait_for_network
# from utils.retry import retry_on_failure
# Logger.info('message')
# wait_for_element(page, locator, timeout=10000)
# @retry_on_failure(retries=3)
"""


def _stage2_steps_py(
    original: str, intent: Dict, feature_files: List[Dict], quality_level: str
) -> Dict[str, Any]:
    page_class = intent.get("page_class", "Page")
    steps_file = intent.get("steps_file", "login_steps.py")
    hint = {"L1": _L1_HINT_PY, "L2": _L2_HINT_PY, "L3": _L3_HINT_PY}.get(quality_level, _L2_HINT_PY)
    extra = _L3_UTILS_PY if quality_level == "L3" else ""
    primary_feature = feature_files[0] if feature_files else {}
    feature_content = primary_feature.get("content", "")

    result = chat(
        [
            {"role": "system", "content": _STEPS_PROMPT_PY},
            {"role": "user", "content": (
                f"Quality level: {quality_level} — {hint}\n{extra}\n\n"
                f"Page Object class: {page_class} (Python, accessed via context.{_py_attr(page_class)})\n\n"
                f"Primary feature file:\n{feature_content}\n\n"
                f"Original test case:\n{original[:600]}"
            )},
        ],
        temperature=0.1,
        max_tokens=3000,
        json_mode=True,
    )
    try:
        data = json.loads(result["answer"])
        return {**data, "tokens_used": result["tokens_used"]}
    except Exception:
        return {
            "step_definitions": {
                "content": f"# Step definitions for {page_class}\n# Parse error — {result['answer'][:200]}",
                "filename": steps_file,
                "path": f"steps/{steps_file}",
            },
            "tokens_used": result["tokens_used"],
        }


def _py_attr(class_name: str) -> str:
    """Convert 'LoginPage' → 'login_page' for context attribute name."""
    import re
    s = re.sub(r"(?<!^)(?=[A-Z])", "_", class_name).lower().replace("_page", "_page")
    return s


# ── Stage 3 (Python): Page Object + Base Page + Locators + Assertions ─────────

_POM_PROMPT_PY = """You are a senior Playwright Python automation engineer writing an enterprise Page Object Model.

== ARCHITECTURE ==
BasePage (pages/base_page.py)
  └── LoginPage (pages/login_page.py)  — uses LoginLocators
LoginLocators  (locators/login_locators.py)  — Playwright locator fields
LoginAssertions (assertions/login_assertions.py) — static assertion methods

== BASE PAGE RULES ==
• Abstract base class using playwright.sync_api.Page (synchronous)
• Methods: __init__(self, page: Page), navigate_to(path: str),
  wait_for_visible(locator, timeout=10000), take_screenshot(name: str)
• Simple, framework-agnostic utility methods only

== PAGE OBJECT RULES ==
• Inherits BasePage
• Constructor: super().__init__(page); self.loc = XxxLocators(page)
• Methods: open(), enter_xxx(), click_xxx(), is_xxx_visible() → bool, verify_xxx()
  — All snake_case
• Delegation only: self.loc.username_input.fill(username) — never call page.* directly
• Parameterised methods accept Scenario Outline values: login(self, username, password)
• No assertions inside Page Object — those live in Assertions class

== LOCATOR RULES ==
• Class with __init__(self, page: Page)
• Locator priority: get_by_test_id() > get_by_role() > get_by_label() > get_by_placeholder() > locator(css)
• NEVER use XPath or positional nth() locators
• Assign each locator as instance attribute in __init__

== ASSERTIONS RULES ==
• Static methods only — no instance state
• Use playwright.sync_api.expect for all assertions
• Pattern: assert_xxx(page: Page, ...) or assert_xxx(locator: Locator, ...)
• One assertion per method; descriptive method names

== PYTHON PLAYWRIGHT SYNC API ==
page.get_by_test_id('id')          # ✅ preferred
page.get_by_role('button', name='Login')
page.get_by_label('Username')
page.get_by_placeholder('Email')
expect(locator).to_be_visible()
expect(locator).to_have_text('...')
expect(page).to_have_url(re.compile(r'/dashboard'))

== OUTPUT ==
{
  "page_object": {
    "content": "complete Python file as escaped string",
    "filename": "login_page.py",
    "path": "pages/login_page.py",
    "methods": ["open", "login", "enter_username", "enter_password", "click_login", "is_dashboard_visible"]
  },
  "base_page": {
    "content": "complete Python file as escaped string",
    "filename": "base_page.py",
    "path": "pages/base_page.py"
  },
  "locators": {
    "content": "complete Python file as escaped string",
    "filename": "login_locators.py",
    "path": "locators/login_locators.py"
  },
  "assertions": {
    "content": "complete Python file as escaped string",
    "filename": "login_assertions.py",
    "path": "assertions/login_assertions.py"
  }
}"""


def _stage3_pom_py(
    original: str, intent: Dict, feature_files: List[Dict],
    steps_content: str, quality_level: str
) -> Dict[str, Any]:
    page_class = intent.get("page_class", "Page")
    hint = {"L1": _L1_HINT_PY, "L2": _L2_HINT_PY, "L3": _L3_HINT_PY}.get(quality_level, _L2_HINT_PY)
    extra = _L3_UTILS_PY if quality_level == "L3" else ""
    primary_feature = feature_files[0] if feature_files else {}
    feature_content = primary_feature.get("content", "")

    module = intent.get("module", "app").lower()
    feature = intent.get("feature", "feature").lower()

    result = chat(
        [
            {"role": "system", "content": _POM_PROMPT_PY},
            {"role": "user", "content": (
                f"Quality level: {quality_level} — {hint}\n{extra}\n\n"
                f"Page class: {page_class}  Base URL: {intent.get('base_url_path', '/')}\n"
                f"Module: {module}  Feature: {feature}\n\n"
                f"Feature file:\n{feature_content}\n\n"
                f"Step definitions (for method alignment):\n{steps_content[:600]}\n\n"
                f"Original test case:\n{original[:400]}"
            )},
        ],
        temperature=0.1,
        max_tokens=3500,
        json_mode=True,
    )
    try:
        data = json.loads(result["answer"])
        return {**data, "tokens_used": result["tokens_used"]}
    except Exception:
        return {
            "page_object": {
                "content": f"# {page_class} — parse error\n# {result['answer'][:200]}",
                "filename": f"{feature}_page.py",
                "path": f"pages/{feature}_page.py",
                "methods": [],
            },
            "base_page": {
                "content": "# base_page.py — parse error",
                "filename": "base_page.py",
                "path": "pages/base_page.py",
            },
            "locators": {
                "content": "# locators — parse error",
                "filename": f"{feature}_locators.py",
                "path": f"locators/{feature}_locators.py",
            },
            "assertions": {
                "content": "# assertions — parse error",
                "filename": f"{feature}_assertions.py",
                "path": f"assertions/{feature}_assertions.py",
            },
            "tokens_used": result["tokens_used"],
        }


# ── Python-specific validation ─────────────────────────────────────────────────

def _validate_py(
    page_object_content: str,
    steps_content: str,
    locators_content: str,
    feature_files: List[Dict],
    bdd_analysis: Dict,
) -> Dict[str, Any]:
    import re
    issues: List[Dict] = []

    # POM violation: direct Playwright API in step bodies
    py_direct_patterns = [
        ("context.page.fill",     "context.page.fill()",     "context.login_page.enter_xxx()"),
        ("context.page.click",    "context.page.click()",    "context.login_page.click_xxx()"),
        ("context.page.goto",     "context.page.goto()",     "context.login_page.open()"),
        ("context.page.locator",  "context.page.locator()",  "use a LoginLocators attribute"),
        ("context.page.get_by",   "context.page.get_by_*()", "delegate to Page Object method"),
    ]
    violating_lines: List[str] = []
    for i, line in enumerate(steps_content.splitlines(), 1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "@given" in stripped or "@when" in stripped or "@then" in stripped:
            continue
        if "def step_" in stripped or "def before_" in stripped:
            continue
        for pattern, label, fix in py_direct_patterns:
            if pattern in line:
                violating_lines.append(
                    f"Line {i}: `{stripped}` → replace with Page Object method (e.g. `{fix}`)"
                )
                break
    if violating_lines:
        issues.append({
            "type": "pom_violation",
            "detail": "Direct Playwright API found in step definitions — steps must only call Page Object methods via context.",
            "fix": "Move all context.page.* calls into the Page Object class. Step bodies call context.login_page.method_name() only.",
            "lines": violating_lines[:5],
        })

    # Duplicate Page Object methods
    seen: set = set()
    for m in re.findall(r"def (\w+)\s*\(self", page_object_content):
        if m in seen and not m.startswith("__"):
            issues.append({
                "type": "duplicate_method",
                "detail": f"Method '{m}()' defined more than once in Page Object.",
                "fix": f"Remove the duplicate `{m}()` definition.",
                "lines": [],
            })
        seen.add(m)

    # Hard-coded waits
    for label, content in [("Page Object", page_object_content), ("Step Definitions", steps_content)]:
        if "time.sleep" in content:
            issues.append({
                "type": "flaky_wait",
                "detail": f"time.sleep() in {label} — hard-coded sleeps cause flaky tests.",
                "fix": "Replace with locator.wait_for(state='visible') or page.wait_for_load_state().",
                "lines": [],
            })

    # XPath / brittle selectors
    for p in ["xpath=", "//div", "//input", "//button", "//span", "//a["]:
        if p in locators_content or p in page_object_content:
            issues.append({
                "type": "brittle_locator",
                "detail": f"XPath/positional selector detected (`{p}`).",
                "fix": "Use get_by_test_id(), get_by_role(), or get_by_label() instead.",
                "lines": [],
            })
            break

    # Missing data-testid hint
    if "get_by_test_id" not in locators_content:
        issues.append({
            "type": "locator_suggestion",
            "detail": "No get_by_test_id() selectors used. Add data-testid attributes to your app for stable locators.",
            "fix": "Use page.get_by_test_id('element-id') in the Locators class for the most resilient selectors.",
            "lines": [],
        })

    # Gherkin quality checks (same as TS)
    _CONJUNCTIONS = {
        'and', 'or', 'but', 'with', 'the', 'a', 'an', 'in', 'on', 'at',
        'by', 'for', 'to', 'of', 'from', 'into', 'that', 'which',
    }
    for ff in feature_files:
        fc = ff.get("content", "")
        scenario_steps = re.findall(r"(?:Given|When|Then|And|But)\s+(.+)", fc)
        if len(scenario_steps) > 10:
            issues.append({
                "type": "gherkin_quality",
                "detail": f"Feature '{ff['filename']}' has {len(scenario_steps)} total steps. Aim for ≤ 8 per scenario.",
                "fix": "Split complex scenarios into smaller focused scenarios.",
                "lines": [],
            })
        hardcoded_steps = []
        for step in scenario_steps:
            raw_quoted = re.findall(r'"([^"]+)"', step)
            data_values = []
            for m in raw_quoted:
                stripped = m.strip()
                if '<' in stripped or '>' in stripped:
                    continue
                if len(stripped) < 2:
                    continue
                if stripped.lower() in _CONJUNCTIONS:
                    continue
                if not re.search(r'[A-Za-z0-9]{2,}', stripped):
                    continue
                data_values.append(stripped)
            if data_values:
                hardcoded_steps.append(f'`{step.strip()}` — hardcoded value(s): {data_values}')
        if hardcoded_steps:
            issues.append({
                "type": "hardcoded_data",
                "detail": "Hardcoded test data detected in step text.",
                "fix": 'Use Scenario Outline: replace "hardcoded_value" with "<param_name>" and add Examples table.',
                "lines": hardcoded_steps[:5],
            })
        ui_patterns = ["click ", "enter text", "type into", "locate ", "select from"]
        for step in scenario_steps:
            for pat in ui_patterns:
                if pat.lower() in step.lower():
                    issues.append({
                        "type": "business_language",
                        "detail": f"Implementation detail in step: '{step.strip()}'",
                        "fix": "Replace UI wording with business language (User logs in / User searches product).",
                        "lines": [f"Step: `{step.strip()}`"],
                    })
                    break

    critical = [i for i in issues if i["type"] in ("pom_violation", "hardcoded_data")]
    return {"passed": len(critical) == 0, "issue_count": len(issues), "issues": issues}


# ── Static validation ──────────────────────────────────────────────────────────

def _validate(
    page_object_content: str,
    steps_content: str,
    locators_content: str,
    feature_files: List[Dict],
    bdd_analysis: Dict,
) -> Dict[str, Any]:
    import re
    issues: List[Dict] = []

    # ── POM violation: direct Playwright API in step bodies ────────────────────
    direct_api_patterns = [
        ("page.click",   "page.click()",   "await pageObj.clickElement()"),
        ("page.fill",    "page.fill()",    "await pageObj.enterValue()"),
        ("page.goto",    "page.goto()",    "await pageObj.navigate()"),
        ("page.locator", "page.locator()", "use a POM Locator field"),
        ("await page.",  "await page.*",   "delegate to a Page Object method"),
    ]
    violating_lines: List[str] = []
    for i, line in enumerate(steps_content.splitlines(), 1):
        if "BeforeAll" in line or "AfterAll" in line or "Browser" in line:
            continue
        if "=" in line and "Page" in line.split("=")[0]:
            continue
        for pattern, label, fix in direct_api_patterns:
            if pattern in line:
                violating_lines.append(
                    f"Line {i}: `{line.strip()}` → replace with Page Object method (e.g. `{fix}`)"
                )
                break
    if violating_lines:
        issues.append({
            "type": "pom_violation",
            "detail": "Direct Playwright API found in step definitions — steps must only call Page Object methods.",
            "fix": "Move all page.* calls into the Page Object class. Step bodies should contain only `await pageObj.methodName()` calls.",
            "lines": violating_lines[:5],
        })

    # ── Duplicate POM methods ─────────────────────────────────────────────────
    seen: set = set()
    for m in re.findall(r"async (\w+)\s*\(", page_object_content):
        if m in seen:
            issues.append({
                "type": "duplicate_method",
                "detail": f"Method '{m}()' defined more than once in Page Object.",
                "fix": f"Remove the duplicate `{m}()` definition.",
                "lines": [],
            })
        seen.add(m)

    # ── Hard-coded waits ──────────────────────────────────────────────────────
    for label, content in [("Page Object", page_object_content), ("Step Definitions", steps_content)]:
        if "waitForTimeout" in content:
            issues.append({
                "type": "flaky_wait",
                "detail": f"waitForTimeout() in {label} — hard-coded sleeps cause flaky tests.",
                "fix": "Replace with waitForSelector(), waitForResponse(), or waitForLoadState().",
                "lines": [],
            })

    # ── XPath / brittle selectors ─────────────────────────────────────────────
    for p in ["xpath=", "//div", "//input", "//button", "//span", "//a["]:
        if p in page_object_content:
            issues.append({
                "type": "brittle_locator",
                "detail": f"XPath/positional selector detected in Page Object (`{p}`).",
                "fix": "Use getByTestId(), getByRole(), or getByLabel() instead.",
                "lines": [],
            })
            break

    # ── Missing data-testid hint ──────────────────────────────────────────────
    if "getByTestId" not in page_object_content:
        issues.append({
            "type": "locator_suggestion",
            "detail": "No data-testid selectors used. Add data-testid attributes to your app for stable selectors.",
            "fix": "Use page.getByTestId('element-id') in the Page Object for the most resilient locators.",
            "lines": [],
        })

    # ── Gherkin quality checks ────────────────────────────────────────────────
    for ff in feature_files:
        fc = ff.get("content", "")
        scenario_steps = re.findall(r"(?:Given|When|Then|And|But)\s+(.+)", fc)
        if len(scenario_steps) > 10:
            issues.append({
                "type": "gherkin_quality",
                "detail": f"Feature '{ff['filename']}' has {len(scenario_steps)} total steps. Aim for ≤ 8 steps per scenario.",
                "fix": "Split complex scenarios into smaller focused scenarios, each with one business objective.",
                "lines": [],
            })
        # Detect hardcoded data in step text (quoted strings that are NOT <param> placeholders)
        _CONJUNCTIONS = {
            'and', 'or', 'but', 'with', 'the', 'a', 'an', 'in', 'on', 'at',
            'by', 'for', 'to', 'of', 'from', 'into', 'that', 'which',
        }
        hardcoded_steps = []
        for step in scenario_steps:
            # Find all double-quoted substrings in the step text
            raw_quoted = re.findall(r'"([^"]+)"', step)
            data_values = []
            for m in raw_quoted:
                stripped = m.strip()
                # Skip placeholders like <username> or <expected_result>
                if '<' in stripped or '>' in stripped:
                    continue
                # Skip empty / whitespace-only / single chars
                if len(stripped) < 2:
                    continue
                # Skip common step conjunctions that naturally fall between two params
                if stripped.lower() in _CONJUNCTIONS:
                    continue
                # Must contain meaningful alphanumeric content (actual test data)
                if not re.search(r'[A-Za-z0-9]{2,}', stripped):
                    continue
                data_values.append(stripped)
            if data_values:
                hardcoded_steps.append(f'`{step.strip()}` — hardcoded value(s): {data_values}')
        if hardcoded_steps:
            issues.append({
                "type": "hardcoded_data",
                "detail": "Hardcoded test data detected in step text — credentials, emails, IDs should never be inline.",
                "fix": 'Convert to Scenario Outline: replace "hardcoded_value" with "<param_name>" and add an Examples table with the values.',
                "lines": hardcoded_steps[:5],
            })
        # Detect UI-language anti-patterns
        ui_patterns = ["click ", "enter text", "type into", "locate ", "select from"]
        for step in scenario_steps:
            for pat in ui_patterns:
                if pat.lower() in step.lower():
                    issues.append({
                        "type": "business_language",
                        "detail": f"Implementation detail in step: '{step.strip()}' — Gherkin should describe business behaviour.",
                        "fix": "Replace UI wording (click/enter/locate) with business language (User logs in / User searches product).",
                        "lines": [f"Step: `{step.strip()}`"],
                    })
                    break

    critical = [i for i in issues if i["type"] in ("pom_violation", "hardcoded_data")]
    return {
        "passed": len(critical) == 0,
        "issue_count": len(issues),
        "issues": issues,
    }


# ── Public entry point ─────────────────────────────────────────────────────────

_VALID_FRAMEWORKS = ("ts_cucumber", "py_behave")


def run(content: str, options: Dict[str, Any] = {}) -> Dict[str, Any]:
    quality_level = str(options.get("quality_level", "L2")).upper()
    if quality_level not in ("L1", "L2", "L3"):
        quality_level = "L2"

    framework = str(options.get("framework", "ts_cucumber"))
    if framework not in _VALID_FRAMEWORKS:
        framework = "ts_cucumber"

    t0 = time.perf_counter()
    total_tokens = 0

    try:
        # Stage 1 — Enterprise BDD Feature Engineering (same for all frameworks)
        s1 = _stage1_bdd(content, quality_level)
        total_tokens += s1.get("tokens_used", 0)
        intent: Dict = s1.get("intent", {})
        feature_files: List[Dict] = s1.get("feature_files", [])
        bdd_analysis: Dict = s1.get("bdd_analysis", {})

        if framework == "py_behave":
            # ── Python + Behave pipeline ────────────────────────────────────────
            _normalise_intent_py(intent)

            s2 = _stage2_steps_py(content, intent, feature_files, quality_level)
            total_tokens += s2.get("tokens_used", 0)
            step_definitions: Dict = s2.get("step_definitions", {})

            s3 = _stage3_pom_py(content, intent, feature_files, step_definitions.get("content", ""), quality_level)
            total_tokens += s3.get("tokens_used", 0)
            page_object: Dict = s3.get("page_object", {})
            base_page: Dict   = s3.get("base_page", {})
            locators: Dict    = s3.get("locators", {})
            assertions: Dict  = s3.get("assertions", {})

            validation = _validate_py(
                page_object.get("content", ""),
                step_definitions.get("content", ""),
                locators.get("content", ""),
                feature_files,
                bdd_analysis,
            )

            extra_fields: Dict = {
                "base_page": base_page,
                "assertions": assertions,
            }

        else:
            # ── TypeScript + Cucumber pipeline (default) ────────────────────────
            s2 = _stage2_steps(content, intent, feature_files, quality_level)
            total_tokens += s2.get("tokens_used", 0)
            step_definitions = s2.get("step_definitions", {})

            s3 = _stage3_pom(content, intent, feature_files, step_definitions.get("content", ""), quality_level)
            total_tokens += s3.get("tokens_used", 0)
            page_object = s3.get("page_object", {})
            locators    = s3.get("locators", {})

            validation = _validate(
                page_object.get("content", ""),
                step_definitions.get("content", ""),
                locators.get("content", ""),
                feature_files,
                bdd_analysis,
            )

            extra_fields = {}

    except Exception as exc:
        import logging, traceback
        logging.getLogger(__name__).error("Pipeline stage error: %s", traceback.format_exc())
        raise RuntimeError(f"Pipeline failed at an AI stage: {type(exc).__name__}: {exc}") from exc

    latency_ms = round((time.perf_counter() - t0) * 1000, 1)
    primary = feature_files[0] if feature_files else {}

    return {
        "intent": intent,
        "bdd_analysis": bdd_analysis,
        "feature_files": feature_files,
        "feature_file": {
            "content": primary.get("content", ""),
            "filename": primary.get("filename", intent.get("feature_filename", "feature.feature")),
            "path": primary.get("path", ""),
        },
        "step_definitions": step_definitions,
        "page_object": page_object,
        "locators": locators,
        "validation": validation,
        "quality_level": quality_level,
        "framework": framework,
        "stages_completed": 3,
        "tokens_used": total_tokens,
        "latency_ms": latency_ms,
        **extra_fields,
    }


def _normalise_intent_py(intent: Dict) -> None:
    """Rewrite TypeScript filenames in intent to Python snake_case equivalents."""
    import re

    def _to_snake(name: str) -> str:
        return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()

    page_class = intent.get("page_class", "LoginPage")
    base = _to_snake(page_class).replace("_page", "")          # login
    module = intent.get("module", "app").lower()

    intent.setdefault("steps_file",        f"{base}_steps.py")
    intent.setdefault("pom_filename",       f"{base}_page.py")
    intent.setdefault("locators_filename",  f"{base}_locators.py")
    intent["steps_file"]       = f"{base}_steps.py"
    intent["pom_filename"]     = f"{base}_page.py"
    intent["locators_filename"] = f"{base}_locators.py"
