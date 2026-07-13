"""Unit tests — flaky agent deterministic scoring functions (no LLM calls)."""
import pytest
from backend.agents.flaky_agent import (
    _score_from_history,
    _score_from_pass_rate,
    _action_from_score,
    _enrich_test,
)


# ── _score_from_history ───────────────────────────────────────────────────────

class TestScoreFromHistory:

    def test_all_fail_returns_100(self):
        assert _score_from_history(["FAIL", "FAIL", "FAIL"]) == 100

    def test_all_pass_returns_0(self):
        assert _score_from_history(["PASS", "PASS", "PASS"]) == 0

    def test_half_pass_returns_50(self):
        assert _score_from_history(["PASS", "FAIL"]) == 50

    def test_one_of_seven_pass_returns_86(self):
        history = ["PASS", "FAIL", "FAIL", "FAIL", "FAIL", "FAIL", "FAIL"]
        assert _score_from_history(history) == 86

    def test_four_of_seven_pass_returns_43(self):
        history = ["PASS", "PASS", "PASS", "PASS", "FAIL", "FAIL", "FAIL"]
        assert _score_from_history(history) == 43

    def test_empty_history_returns_0(self):
        assert _score_from_history([]) == 0

    def test_single_pass_returns_0(self):
        assert _score_from_history(["PASS"]) == 0

    def test_single_fail_returns_100(self):
        assert _score_from_history(["FAIL"]) == 100

    def test_case_insensitive_pass(self):
        assert _score_from_history(["pass", "FAIL"]) == 50

    def test_case_insensitive_mixed(self):
        assert _score_from_history(["Pass", "pass", "PASS"]) == 0

    def test_six_of_ten_fail_returns_60(self):
        history = ["PASS"] * 4 + ["FAIL"] * 6
        assert _score_from_history(history) == 60

    def test_score_is_integer(self):
        result = _score_from_history(["PASS", "FAIL", "FAIL"])
        assert isinstance(result, int)

    def test_score_bounds_0_to_100(self):
        for history in [[], ["PASS"], ["FAIL"], ["PASS", "FAIL", "PASS"]]:
            score = _score_from_history(history)
            assert 0 <= score <= 100


# ── _score_from_pass_rate ─────────────────────────────────────────────────────

class TestScoreFromPassRate:

    def test_zero_percent_returns_100(self):
        assert _score_from_pass_rate("0%") == 100

    def test_hundred_percent_returns_0(self):
        assert _score_from_pass_rate("100%") == 0

    def test_50_percent_returns_50(self):
        assert _score_from_pass_rate("50%") == 50

    def test_43_percent_returns_57(self):
        assert _score_from_pass_rate("43%") == 57

    def test_with_spaces(self):
        assert _score_from_pass_rate(" 75% ") == 25

    def test_invalid_string_returns_0(self):
        assert _score_from_pass_rate("invalid") == 0

    def test_empty_string_returns_0(self):
        assert _score_from_pass_rate("") == 0

    def test_integer_type_returns_0(self):
        assert _score_from_pass_rate(None) == 0  # type: ignore

    def test_result_is_integer(self):
        assert isinstance(_score_from_pass_rate("60%"), int)


# ── _action_from_score ────────────────────────────────────────────────────────

class TestActionFromScore:

    def test_score_100_is_fix_now(self):
        assert _action_from_score(100) == "Fix Now"

    def test_score_80_is_fix_now(self):
        assert _action_from_score(80) == "Fix Now"

    def test_score_79_is_quarantine(self):
        assert _action_from_score(79) == "Quarantine"

    def test_score_50_is_quarantine(self):
        assert _action_from_score(50) == "Quarantine"

    def test_score_49_is_monitor(self):
        assert _action_from_score(49) == "Monitor"

    def test_score_20_is_monitor(self):
        assert _action_from_score(20) == "Monitor"

    def test_score_19_is_stable(self):
        assert _action_from_score(19) == "Stable"

    def test_score_0_is_stable(self):
        assert _action_from_score(0) == "Stable"

    def test_boundary_exactly_80(self):
        assert _action_from_score(80) == "Fix Now"

    def test_boundary_exactly_50(self):
        assert _action_from_score(50) == "Quarantine"

    def test_boundary_exactly_20(self):
        assert _action_from_score(20) == "Monitor"


# ── _enrich_test ─────────────────────────────────────────────────────────────

class TestEnrichTest:

    def test_enrich_computes_score_from_history(self):
        t = {"name": "test1", "run_history": ["FAIL", "FAIL", "PASS", "FAIL"]}
        result = _enrich_test(t)
        assert result["flaky_score"] == 75

    def test_enrich_sets_action(self):
        t = {"name": "test1", "run_history": ["FAIL", "FAIL"]}
        result = _enrich_test(t)
        assert result["action"] == "Fix Now"

    def test_enrich_sets_pass_rate_string(self):
        t = {"name": "test1", "run_history": ["PASS", "FAIL"]}
        result = _enrich_test(t)
        assert result["pass_rate"] == "50%"

    def test_enrich_all_pass_stable(self):
        t = {"name": "test1", "run_history": ["PASS", "PASS", "PASS"]}
        result = _enrich_test(t)
        assert result["flaky_score"] == 0
        assert result["action"] == "Stable"

    def test_enrich_falls_back_to_pass_rate_string_when_no_history(self):
        t = {"name": "test1", "pass_rate": "25%"}
        result = _enrich_test(t)
        assert result["flaky_score"] == 75

    def test_enrich_no_history_no_pass_rate_returns_0(self):
        t = {"name": "test1"}
        result = _enrich_test(t)
        assert result["flaky_score"] == 0
        assert result["action"] == "Stable"

    def test_enrich_preserves_other_fields(self):
        t = {
            "name": "test1",
            "failure_category": "Timing Issue",
            "confidence": 85,
            "run_history": ["PASS", "FAIL"],
        }
        result = _enrich_test(t)
        assert result["failure_category"] == "Timing Issue"
        assert result["confidence"] == 85

    def test_enrich_overwrites_llm_score_if_history_present(self):
        t = {
            "name": "test1",
            "run_history": ["FAIL", "FAIL"],
            "flaky_score": 0,   # LLM wrongly returned 0
            "action": "Stable",  # LLM wrongly said stable
        }
        result = _enrich_test(t)
        assert result["flaky_score"] == 100  # Python overrides with truth
        assert result["action"] == "Fix Now"
