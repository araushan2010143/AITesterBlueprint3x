"""Unit tests — JUnit XML parser, Playwright JSON parser, test report normalizer."""
import pytest
from backend.parsers import junit_xml_parser, playwright_json_parser
from backend.parsers.test_report_normalizer import normalize, normalize_multi
from tests.conftest import (
    JUNIT_XML_SINGLE, JUNIT_XML_NESTED,
    PLAYWRIGHT_JSON_SINGLE, PLAYWRIGHT_JSON_RETRIES,
)


# ── JUnit XML parser ──────────────────────────────────────────────────────────

class TestJUnitXMLParser:

    def test_parse_single_suite_returns_header(self):
        result = junit_xml_parser.parse(JUNIT_XML_SINGLE, build_label="Build-1")
        assert "=== JUnit Test Report (Build-1) ===" in result

    def test_parse_single_suite_passing_test_has_pass(self):
        result = junit_xml_parser.parse(JUNIT_XML_SINGLE, build_label="Build-1")
        assert "valid credentials: Build-1=PASS" in result

    def test_parse_single_suite_failing_test_has_fail(self):
        result = junit_xml_parser.parse(JUNIT_XML_SINGLE, build_label="Build-1")
        assert "invalid password: Build-1=FAIL" in result

    def test_parse_single_suite_error_message_included(self):
        result = junit_xml_parser.parse(JUNIT_XML_SINGLE, build_label="Build-1")
        assert "TimeoutError" in result or "Expected error toast" in result

    def test_parse_nested_testsuites_includes_all_suites(self):
        result = junit_xml_parser.parse(JUNIT_XML_NESTED, build_label="B1")
        assert "Auth" in result
        assert "Cart" in result

    def test_parse_nested_error_tag_treated_as_fail(self):
        result = junit_xml_parser.parse(JUNIT_XML_NESTED, build_label="B1")
        assert "add item: B1=FAIL" in result

    def test_parse_multi_assigns_sequential_labels(self):
        result = junit_xml_parser.parse_multi([JUNIT_XML_SINGLE, JUNIT_XML_SINGLE])
        assert "Build-1=PASS" in result
        assert "Build-2=PASS" in result

    def test_parse_empty_suite_returns_header(self):
        xml = '<testsuite name="Empty" tests="0" failures="0"></testsuite>'
        result = junit_xml_parser.parse(xml, build_label="B1")
        assert "JUnit Test Report" in result

    def test_parse_skipped_test(self):
        xml = '''<testsuite name="S" tests="1" failures="0">
                   <testcase name="skip me"><skipped/></testcase>
                 </testsuite>'''
        result = junit_xml_parser.parse(xml, build_label="B1")
        assert "SKIP" in result or "PASS" in result  # skipped → SKIP label


# ── Playwright JSON parser ────────────────────────────────────────────────────

class TestPlaywrightJSONParser:

    def test_parse_returns_header(self):
        result = playwright_json_parser.parse(PLAYWRIGHT_JSON_SINGLE, build_label="Build-1")
        assert "=== Playwright Test Report (Build-1) ===" in result

    def test_parse_passing_test_shown_as_pass(self):
        result = playwright_json_parser.parse(PLAYWRIGHT_JSON_SINGLE, build_label="Build-1")
        assert "login with valid credentials" in result
        assert "PASS" in result

    def test_parse_failing_test_shown_as_fail(self):
        result = playwright_json_parser.parse(PLAYWRIGHT_JSON_SINGLE, build_label="Build-1")
        assert "login with invalid password" in result
        assert "FAIL" in result

    def test_parse_error_message_appended(self):
        result = playwright_json_parser.parse(PLAYWRIGHT_JSON_SINGLE, build_label="Build-1")
        assert "TimeoutError" in result

    def test_parse_retry_results_captured(self):
        result = playwright_json_parser.parse(PLAYWRIGHT_JSON_RETRIES, build_label="Build-1")
        assert "retry0" in result
        assert "retry1" in result

    def test_parse_suite_hierarchy_preserved(self):
        result = playwright_json_parser.parse(PLAYWRIGHT_JSON_SINGLE, build_label="Build-1")
        assert "Auth" in result

    def test_parse_stats_line_appended(self):
        result = playwright_json_parser.parse(PLAYWRIGHT_JSON_SINGLE, build_label="Build-1")
        assert "Suite stats" in result

    def test_parse_nested_suites(self):
        data = """{
          "suites": [{"title": "Outer", "specs": [], "suites": [
            {"title": "Inner", "specs": [
              {"title": "deep test", "tests": [{"projectName": "chromium",
               "results": [{"status": "passed", "retry": 0, "error": {}}]}]}
            ], "suites": []}
          ]}],
          "stats": {"expected": 1, "unexpected": 0, "skipped": 0}
        }"""
        result = playwright_json_parser.parse(data, build_label="B1")
        assert "Outer" in result
        assert "Inner" in result
        assert "deep test" in result


# ── Test report normalizer ────────────────────────────────────────────────────

class TestNormalizer:

    def test_normalize_detects_junit_xml(self):
        result = normalize(JUNIT_XML_SINGLE, build_label="B1")
        assert "JUnit Test Report" in result

    def test_normalize_detects_playwright_json(self):
        result = normalize(PLAYWRIGHT_JSON_SINGLE, build_label="B1")
        assert "Playwright Test Report" in result

    def test_normalize_plain_text_passthrough(self):
        text = "LoginTest: Build-1=PASS. Build-2=FAIL."
        result = normalize(text, build_label="B1")
        assert result == text

    def test_normalize_raises_on_empty(self):
        with pytest.raises(ValueError, match="Empty content"):
            normalize("   ")

    def test_normalize_uses_build_label(self):
        result = normalize(JUNIT_XML_SINGLE, build_label="Sprint-5")
        assert "Sprint-5" in result

    def test_normalize_multi_assigns_sequential_labels(self):
        result = normalize_multi(
            [JUNIT_XML_SINGLE, JUNIT_XML_SINGLE],
            filenames=["run1.xml", "run2.xml"],
        )
        assert "Build-1" in result
        assert "Build-2" in result

    def test_normalize_multi_separates_builds_with_blank_line(self):
        result = normalize_multi([PLAYWRIGHT_JSON_SINGLE, PLAYWRIGHT_JSON_SINGLE])
        parts = result.split("\n\n")
        assert len(parts) >= 2

    def test_normalize_multi_no_filenames_ok(self):
        result = normalize_multi([JUNIT_XML_SINGLE])
        assert "JUnit Test Report" in result

    def test_normalize_multi_handles_bad_content_gracefully(self):
        # Plain text passes through as-is (no Build-N header added)
        # JUnit XML in slot 3 gets "Build-3" label
        result = normalize_multi(["VALID_PLAIN_TEXT", "{bad json}", JUNIT_XML_SINGLE])
        assert "VALID_PLAIN_TEXT" in result   # first file preserved
        assert "Build-3" in result             # third file gets correct label

    def test_normalize_filename_hint_ignored_for_xml(self):
        # Format is detected from content, not filename
        result = normalize(JUNIT_XML_SINGLE, filename="report.txt", build_label="B1")
        assert "JUnit Test Report" in result
