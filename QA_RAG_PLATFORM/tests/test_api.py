"""Integration tests — FastAPI endpoints using TestClient with mocked LLM."""
import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from backend.main import app
from tests.conftest import (
    JUNIT_XML_SINGLE,
    PLAYWRIGHT_JSON_SINGLE,
    MOCK_STAGE1_RESPONSE,
    MOCK_STAGE2_RESPONSE,
)

client = TestClient(app)


# ── /api/ai/actions ───────────────────────────────────────────────────────────

class TestListActions:

    def test_get_actions_returns_200(self):
        r = client.get("/api/ai/actions")
        assert r.status_code == 200

    def test_get_actions_returns_list(self):
        r = client.get("/api/ai/actions")
        assert "actions" in r.json()
        assert isinstance(r.json()["actions"], list)

    def test_get_actions_contains_flaky_analyzer(self):
        r = client.get("/api/ai/actions")
        ids = [a["id"] for a in r.json()["actions"]]
        assert "flaky_analyzer" in ids

    def test_get_actions_all_have_required_fields(self):
        r = client.get("/api/ai/actions")
        for action in r.json()["actions"]:
            assert "id" in action
            assert "label" in action
            assert "description" in action

    def test_get_actions_has_12_entries(self):
        r = client.get("/api/ai/actions")
        assert len(r.json()["actions"]) == 12


# ── /api/ai/parse-report ──────────────────────────────────────────────────────

class TestParseReport:

    def test_parse_junit_xml_returns_200(self):
        r = client.post(
            "/api/ai/parse-report",
            files={"file": ("report.xml", JUNIT_XML_SINGLE.encode(), "text/xml")},
            data={"build_label": "Build-1"},
        )
        assert r.status_code == 200

    def test_parse_junit_xml_detects_format(self):
        r = client.post(
            "/api/ai/parse-report",
            files={"file": ("report.xml", JUNIT_XML_SINGLE.encode(), "text/xml")},
            data={"build_label": "Build-1"},
        )
        assert r.json()["format"] == "JUnit XML"

    def test_parse_junit_xml_returns_text(self):
        r = client.post(
            "/api/ai/parse-report",
            files={"file": ("report.xml", JUNIT_XML_SINGLE.encode(), "text/xml")},
            data={"build_label": "B1"},
        )
        assert "JUnit Test Report" in r.json()["text"]
        assert "B1" in r.json()["text"]

    def test_parse_junit_xml_returns_filename(self):
        r = client.post(
            "/api/ai/parse-report",
            files={"file": ("myreport.xml", JUNIT_XML_SINGLE.encode(), "text/xml")},
        )
        assert r.json()["filename"] == "myreport.xml"

    def test_parse_playwright_json_returns_200(self):
        r = client.post(
            "/api/ai/parse-report",
            files={"file": ("results.json", PLAYWRIGHT_JSON_SINGLE.encode(), "application/json")},
            data={"build_label": "Build-2"},
        )
        assert r.status_code == 200

    def test_parse_playwright_json_detects_format(self):
        r = client.post(
            "/api/ai/parse-report",
            files={"file": ("results.json", PLAYWRIGHT_JSON_SINGLE.encode(), "application/json")},
        )
        assert r.json()["format"] == "Playwright JSON"

    def test_parse_playwright_json_returns_text(self):
        r = client.post(
            "/api/ai/parse-report",
            files={"file": ("results.json", PLAYWRIGHT_JSON_SINGLE.encode(), "application/json")},
            data={"build_label": "Build-2"},
        )
        assert "Playwright Test Report (Build-2)" in r.json()["text"]

    def test_parse_plain_text_passthrough(self):
        plain = "MyTest: Build-1=PASS. Build-2=FAIL."
        r = client.post(
            "/api/ai/parse-report",
            files={"file": ("log.txt", plain.encode(), "text/plain")},
        )
        assert r.status_code == 200
        assert r.json()["format"] == "Plain Text"
        assert r.json()["text"] == plain

    def test_parse_char_count_matches_text_length(self):
        r = client.post(
            "/api/ai/parse-report",
            files={"file": ("report.xml", JUNIT_XML_SINGLE.encode(), "text/xml")},
        )
        data = r.json()
        assert data["char_count"] == len(data["text"])

    def test_parse_missing_file_returns_422(self):
        r = client.post("/api/ai/parse-report")
        assert r.status_code == 422

    def test_parse_default_build_label_is_build1(self):
        r = client.post(
            "/api/ai/parse-report",
            files={"file": ("r.xml", JUNIT_XML_SINGLE.encode(), "text/xml")},
        )
        assert "Build-1" in r.json()["text"]

    def test_parse_custom_build_label_propagated(self):
        r = client.post(
            "/api/ai/parse-report",
            files={"file": ("r.xml", JUNIT_XML_SINGLE.encode(), "text/xml")},
            data={"build_label": "Sprint-42"},
        )
        assert "Sprint-42" in r.json()["text"]


# ── /api/ai/flaky_analyzer  (LLM mocked) ─────────────────────────────────────

def _mock_chat(messages, **kwargs):
    """Return canned stage1 or stage2 response based on prompt content."""
    system_msg = messages[0]["content"] if messages else ""
    if "fixes" in system_msg.lower() or "before" in system_msg.lower():
        return {"answer": json.dumps(MOCK_STAGE2_RESPONSE), "tokens_used": 500, "latency_ms": 100}
    return {"answer": json.dumps(MOCK_STAGE1_RESPONSE), "tokens_used": 800, "latency_ms": 200}


class TestFlakyAnalyzer:

    @patch("backend.agents.flaky_agent._embed", return_value=None)
    @patch("backend.llm.groq_llm.chat", side_effect=_mock_chat)
    def test_flaky_analyzer_returns_200(self, mock_llm, mock_embed):
        r = client.post("/api/ai/flaky_analyzer", json={
            "action": "flaky_analyzer",
            "content": "LoginTests › invalid password: Build-1=FAIL. Build-2=FAIL. Error: TimeoutError",
        })
        assert r.status_code == 200

    @patch("backend.agents.flaky_agent._embed", return_value=None)
    @patch("backend.llm.groq_llm.chat", side_effect=_mock_chat)
    def test_flaky_analyzer_result_has_tests(self, mock_llm, mock_embed):
        r = client.post("/api/ai/flaky_analyzer", json={
            "action": "flaky_analyzer",
            "content": "LoginTests › invalid password: Build-1=FAIL. Build-2=FAIL.",
        })
        result = r.json()["result"]
        assert "tests" in result
        assert len(result["tests"]) > 0

    @patch("backend.agents.flaky_agent._embed", return_value=None)
    @patch("backend.llm.groq_llm.chat", side_effect=_mock_chat)
    def test_flaky_analyzer_scores_computed_by_python(self, mock_llm, mock_embed):
        r = client.post("/api/ai/flaky_analyzer", json={
            "action": "flaky_analyzer",
            "content": "LoginTests › invalid password: Build-1=FAIL. Build-2=FAIL. Build-3=FAIL.",
        })
        tests = r.json()["result"]["tests"]
        for t in tests:
            if t["run_history"] == ["FAIL", "FAIL", "FAIL"]:
                assert t["flaky_score"] == 100
                assert t["action"] == "Fix Now"

    @patch("backend.agents.flaky_agent._embed", return_value=None)
    @patch("backend.llm.groq_llm.chat", side_effect=_mock_chat)
    def test_flaky_analyzer_result_has_summary(self, mock_llm, mock_embed):
        r = client.post("/api/ai/flaky_analyzer", json={
            "action": "flaky_analyzer",
            "content": "MyTest: Build-1=FAIL.",
        })
        assert "summary" in r.json()["result"]

    @patch("backend.agents.flaky_agent._embed", return_value=None)
    @patch("backend.llm.groq_llm.chat", side_effect=_mock_chat)
    def test_flaky_analyzer_result_has_release_gate(self, mock_llm, mock_embed):
        r = client.post("/api/ai/flaky_analyzer", json={
            "action": "flaky_analyzer",
            "content": "MyTest: Build-1=FAIL.",
        })
        assert "release_gate" in r.json()["result"]
        assert "decision" in r.json()["result"]["release_gate"]

    @patch("backend.agents.flaky_agent._embed", return_value=None)
    @patch("backend.llm.groq_llm.chat", side_effect=_mock_chat)
    def test_flaky_analyzer_result_has_ai_report(self, mock_llm, mock_embed):
        r = client.post("/api/ai/flaky_analyzer", json={
            "action": "flaky_analyzer",
            "content": "MyTest: Build-1=FAIL.",
        })
        assert "ai_report" in r.json()["result"]

    @patch("backend.agents.flaky_agent._embed", return_value=None)
    @patch("backend.llm.groq_llm.chat", side_effect=_mock_chat)
    def test_flaky_analyzer_code_fix_merged_into_test(self, mock_llm, mock_embed):
        r = client.post("/api/ai/flaky_analyzer", json={
            "action": "flaky_analyzer",
            "content": "LoginTests › invalid password: Build-1=FAIL.",
        })
        tests = r.json()["result"]["tests"]
        for t in tests:
            assert "suggested_fix" in t

    def test_flaky_analyzer_missing_content_returns_400(self):
        r = client.post("/api/ai/flaky_analyzer", json={
            "action": "flaky_analyzer",
            "content": "",
        })
        assert r.status_code == 400

    def test_unknown_action_returns_400(self):
        r = client.post("/api/ai/unknown_action", json={
            "action": "unknown_action",
            "content": "some content",
        })
        assert r.status_code == 400


# ── /api/stats/health ─────────────────────────────────────────────────────────

class TestHealth:

    def test_health_returns_200(self):
        r = client.get("/api/stats/health")
        assert r.status_code == 200

    def test_root_returns_platform_info(self):
        r = client.get("/")
        assert r.status_code == 200
        assert "QA RAG Platform" in r.json()["name"]
