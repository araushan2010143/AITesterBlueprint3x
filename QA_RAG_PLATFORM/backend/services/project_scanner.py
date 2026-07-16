"""Pre-migration Project Scanner.

Analyzes a list of (filename, content) tuples and returns a comprehensive
project scan report: framework, language, file classification, locator
quality, complexity, and a Migration Readiness Score (0-100).
"""
from __future__ import annotations
import re
from pathlib import Path
from typing import List, Tuple, Dict, Any

# ── Language detection ────────────────────────────────────────────────────────

_LANG_MAP: Dict[str, str] = {
    ".java": "Java", ".py": "Python", ".cs": "C#",
    ".ts": "TypeScript", ".tsx": "TypeScript",
    ".js": "JavaScript", ".jsx": "JavaScript",
    ".kt": "Kotlin", ".rb": "Ruby",
    ".feature": "Gherkin", ".robot": "Robot Framework",
}

# ── Framework fingerprints ────────────────────────────────────────────────────

_FRAMEWORKS: Dict[str, Dict[str, List[str]]] = {
    "Java": {
        "TestNG":      ["import org.testng", "@Test", "@BeforeMethod", "@AfterMethod"],
        "JUnit 4":     ["import org.junit;", "@RunWith", "junit.framework"],
        "JUnit 5":     ["import org.junit.jupiter", "@Test", "@BeforeEach"],
        "Selenium":    ["import org.openqa.selenium", "WebDriver", "WebElement", "By."],
        "Appium":      ["import io.appium", "AppiumDriver", "MobileElement", "AndroidDriver"],
        "Cucumber":    ["import io.cucumber", "@Given", "@When", "@Then", "@Step"],
        "RestAssured": ["import io.restassured", "given()", "RestAssured."],
        "Serenity":    ["import net.serenitybdd", "@Managed", "SerenityRunner"],
        "Gauge":       ["import com.thoughtworks.gauge", "@Step"],
    },
    "Python": {
        "Pytest":    ["import pytest", "def test_", "@pytest.", "conftest"],
        "Unittest":  ["import unittest", "TestCase", "def setUp"],
        "Selenium":  ["from selenium", "webdriver", "find_element", "By."],
        "Playwright":["from playwright", "async_playwright", "page.goto"],
        "Robot":     ["Robot Framework", "*** Test Cases ***"],
        "Behave":    ["from behave", "@given", "@when", "@then"],
    },
    "C#": {
        "NUnit":     ["using NUnit", "[Test]", "[TestCase]", "[SetUp]", "[OneTimeSetUp]"],
        "MSTest":    ["using Microsoft.VisualStudio", "[TestMethod]", "[TestClass]"],
        "xUnit":     ["using Xunit", "[Fact]", "[Theory]", "ITestOutputHelper"],
        "Selenium":  ["using OpenQA.Selenium", "IWebDriver", "IWebElement", "By."],
        "SpecFlow":  ["using TechTalk.SpecFlow", "[Given]", "[When]", "[Then]"],
    },
    "TypeScript": {
        "Playwright":  ["from '@playwright", "import { test", "page.goto", "page.locator"],
        "Cypress":     ["import { cy }", "cy.visit", "cy.get", "Cypress."],
        "WebdriverIO": ["import { browser }", "browser.url", "$(", "$$("],
        "Jest":        ["describe(", "it(", "test(", "expect(", "beforeEach("],
    },
    "Gherkin": {
        "Cucumber": ["Feature:", "Scenario:", "Given ", "When ", "Then "],
        "SpecFlow": ["Feature:", "Scenario Outline:", "Examples:"],
    },
    "Robot Framework": {
        "Robot": ["*** Test Cases ***", "*** Keywords ***", "*** Settings ***"],
    },
}

# ── Test-method detectors ─────────────────────────────────────────────────────

_TEST_RE: Dict[str, List[str]] = {
    "java":             [r"@Test\b", r"@ParameterizedTest\b", r"@RepeatedTest\b"],
    "python":           [r"def test_\w+", r"def setUp\b"],
    "csharp":           [r"\[Test\]", r"\[TestMethod\]", r"\[TestCase", r"\[Fact\]", r"\[Theory\]"],
    "typescript":       [r"\btest\s*\(", r"\bit\s*\(", r"\bdescribe\s*\("],
    "javascript":       [r"\btest\s*\(", r"\bit\s*\(", r"\bdescribe\s*\("],
    "kotlin":           [r"@Test\b", r"fun test\w+"],
    "gherkin":          [r"^\s*(Scenario|Scenario Outline)\s*:", r"^\s*Example\s*:"],
    "robot framework":  [r"\*\*\*\s*Test Cases\s*\*\*\*"],
}

# ── Locator patterns ──────────────────────────────────────────────────────────

_LOCATORS: Dict[str, List[str]] = {
    "xpath":  [r"By\.xpath\(", r"how\s*=\s*How\.XPATH", r"\.find.*xpath", r'xpath=".+?"',
               r"XPath\.", r"//\w+\[", r'@xpath\s*='],
    "css":    [r"By\.cssSelector\(", r"how\s*=\s*How\.CSS", r"\.find.*css",
               r'css=".+?"', r"querySelector\(", r"locator\("],
    "id":     [r"By\.id\(", r"how\s*=\s*How\.ID", r"findById", r"getById",
               r'id=".+?"', r"getElementById"],
    "name":   [r"By\.name\(", r"how\s*=\s*How\.NAME", r"findByName",
               r"getByLabel\(", r"getByPlaceholder\("],
    "class":  [r"By\.className\(", r"how\s*=\s*How\.CLASS", r"getElementsByClass"],
    "modern": [r"getByRole\(", r"getByTestId\(", r"data-testid", r"getByText\("],
}

# ── Page object signals ───────────────────────────────────────────────────────

_PAGE_OBJ_RE = [
    r"class\s+\w+Page\b", r"class\s+\w+Screen\b", r"class\s+\w+Component\b",
    r"extends\s+BasePage\b", r"extends\s+Page\b", r"@Page\b",
    r"@FindBy\b", r"@AndroidFindBy\b", r"@iOSFindBy\b",
    r"\[FindsBy\b", r"PageFactory",
]

# ── Complexity signals ────────────────────────────────────────────────────────

_COMPLEX_RE = [
    r"Thread\.sleep", r"waitForTimeout\(", r"time\.sleep\(",
    r"JavascriptExecutor", r"executeScript\(",
    r"\bActions\b", r"\bTouchAction\b", r"MoveToElement",
    r"SwitchTo\(\).*Frame", r"switchToFrame", r"driver\.switch",
    r"getWindowHandles", r"switchToWindow",
    r"FluentWait", r"ExpectedConditions",
    r"File.*upload", r"sendKeys.*File",
    r"dragAndDrop", r"contextClick\(",
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _lang(filename: str) -> str:
    return _LANG_MAP.get(Path(filename).suffix.lower(), "Other")


def _count_tests(content: str, lang: str) -> int:
    key = lang.lower().replace(" ", "").replace("#", "csharp")
    patterns = _TEST_RE.get(key, [])
    return min(sum(len(re.findall(p, content, re.MULTILINE)) for p in patterns), 500)


def _frameworks(content: str, lang: str) -> List[str]:
    out = []
    for fw, signals in _FRAMEWORKS.get(lang, {}).items():
        if sum(1 for s in signals if s in content) >= max(2, len(signals) // 3):
            out.append(fw)
    return out


def _locators(content: str) -> Dict[str, int]:
    return {
        k: sum(len(re.findall(p, content)) for p in pats)
        for k, pats in _LOCATORS.items()
        if (c := sum(len(re.findall(p, content)) for p in pats)) > 0
        for k in [k]  # trick: conditional comprehension workaround
    }


def _locators_fixed(content: str) -> Dict[str, int]:
    """Return locator counts (keys that have hits only)."""
    result = {}
    for k, pats in _LOCATORS.items():
        c = sum(len(re.findall(p, content)) for p in pats)
        if c:
            result[k] = c
    return result


def _is_page_object(content: str) -> bool:
    return any(re.search(p, content, re.IGNORECASE) for p in _PAGE_OBJ_RE)


def _complexity(content: str) -> str:
    hits = sum(1 for p in _COMPLEX_RE if re.search(p, content, re.IGNORECASE))
    return "complex" if hits > 2 else ("medium" if hits > 0 else "simple")


# ── Readiness calculator ──────────────────────────────────────────────────────

def _readiness(
    fws: List[str],
    locs: Dict[str, int],
    cx: Dict[str, int],
    has_pom: bool,
    total_tests: int,
) -> Tuple[int, Dict[str, Any]]:
    score = 70
    good: List[str] = []
    warn: List[str] = []

    # Framework compatibility
    easy = {"TestNG", "JUnit 4", "JUnit 5", "Selenium", "Pytest", "Unittest", "NUnit", "MSTest", "xUnit"}
    hard = {"Appium", "RestAssured", "Serenity", "Gauge"}

    easy_match = [f for f in fws if f in easy]
    hard_match = [f for f in fws if f in hard]

    if easy_match:
        score += 10
        good.append(f"Standard frameworks detected: {', '.join(easy_match)}")
    if hard_match:
        score -= 15
        warn.append(f"Non-standard frameworks need manual review: {', '.join(hard_match)}")

    # Locator quality
    total = sum(locs.values()) or 1
    xpath_pct = locs.get("xpath", 0) / total
    modern_pct = locs.get("modern", 0) / total
    id_css_pct = (locs.get("id", 0) + locs.get("css", 0)) / total

    if xpath_pct > 0.6:
        score -= 15
        warn.append(f"XPath dominant ({xpath_pct:.0%}) — brittle locators will need refactoring")
    elif id_css_pct > 0.5:
        score += 5
        good.append(f"Good locator hygiene — ID/CSS dominant ({id_css_pct:.0%})")
    if modern_pct > 0.25:
        score += 5
        good.append("Modern locators (getByRole / getByTestId) detected")

    # Page object pattern
    if has_pom:
        score += 8
        good.append("Page Object Model detected — maps cleanly to Playwright's Page model")
    else:
        warn.append("No POM — Playwright page objects will be auto-generated from scratch")

    # Complexity
    total_files = sum(cx.values()) or 1
    complex_pct = cx.get("complex", 0) / total_files
    medium_pct = cx.get("medium", 0) / total_files

    if complex_pct > 0.3:
        score -= 20
        warn.append(f"{complex_pct:.0%} of files use complex patterns (JS execution, frames, drag-drop)")
    elif complex_pct > 0.1:
        score -= 8
        warn.append(f"{complex_pct:.0%} complex files may need manual review")
    if medium_pct < 0.4:
        score += 5
        good.append("Mostly simple test structure — high auto-migration potential")

    # Scale
    if total_tests > 200:
        score -= 5
        warn.append(f"Large suite ({total_tests} tests) — batch processing recommended")

    score = max(5, min(99, score))
    auto_pct = score
    manual_pct = 100 - auto_pct

    return score, {
        "score": score,
        "auto_migrate_pct": auto_pct,
        "manual_review_pct": manual_pct,
        "good": good,
        "needs_attention": warn,
    }


# ── Public API ────────────────────────────────────────────────────────────────

def scan_project(files: List[Tuple[str, str]]) -> Dict[str, Any]:
    """Analyse (filename, content) pairs and return a full scan report."""
    lang_counts: Dict[str, int] = {}
    fw_counts: Dict[str, int] = {}
    all_locs: Dict[str, int] = {}
    cx_counts = {"simple": 0, "medium": 0, "complex": 0}
    total_tests = 0
    page_obj_count = 0
    test_file_count = 0
    util_count = 0
    other_count = 0
    file_details = []

    for filename, content in files:
        lang = _lang(filename)
        lang_counts[lang] = lang_counts.get(lang, 0) + 1

        fws = _frameworks(content, lang)
        for fw in fws:
            fw_counts[fw] = fw_counts.get(fw, 0) + 1

        tests = _count_tests(content, lang)
        total_tests += tests

        locs = _locators_fixed(content)
        for k, v in locs.items():
            all_locs[k] = all_locs.get(k, 0) + v

        cx = _complexity(content)
        cx_counts[cx] += 1

        is_po = _is_page_object(content)
        is_test = tests > 0
        is_util = not is_po and not is_test and lang != "Other"

        ftype = "page_object" if is_po else ("test" if is_test else ("utility" if is_util else "other"))
        if is_po:
            page_obj_count += 1
        elif is_test:
            test_file_count += 1
        elif is_util:
            util_count += 1
        else:
            other_count += 1

        file_details.append({
            "name": filename,
            "language": lang,
            "type": ftype,
            "tests": tests,
            "complexity": cx,
            "frameworks": fws,
            "locators": locs,
            "content_preview": content[:4_000],  # first 4 KB for AI per-file analysis
        })

    dominant_lang = max(lang_counts, key=lang_counts.get) if lang_counts else "Unknown"
    top_fws = sorted(fw_counts, key=fw_counts.get, reverse=True)[:3]
    framework_str = " + ".join(top_fws) if top_fws else "Unknown"

    total_locs = sum(all_locs.values()) or 1
    loc_pct = {k: round(v * 100 / total_locs) for k, v in all_locs.items()}

    readiness_score, readiness_breakdown = _readiness(
        top_fws, all_locs, cx_counts, page_obj_count > 0, total_tests
    )

    # Human review time estimate: 5 min/simple, 20 min/medium, 60 min/complex
    est_minutes = cx_counts["simple"] * 5 + cx_counts["medium"] * 20 + cx_counts["complex"] * 60
    est_hours = round(est_minutes / 60, 1)

    return {
        "total_files": len(files),
        "test_files": test_file_count,
        "page_objects": page_obj_count,
        "utility_files": util_count,
        "other_files": other_count,
        "total_tests": total_tests,
        "language": dominant_lang,
        "language_breakdown": lang_counts,
        "framework": framework_str,
        "framework_breakdown": fw_counts,
        "locator_breakdown": loc_pct,
        "locator_raw": all_locs,
        "complexity_breakdown": cx_counts,
        "readiness_score": readiness_score,
        "readiness_breakdown": readiness_breakdown,
        "estimated_review_hours": est_hours,
        "file_details": file_details,
    }
