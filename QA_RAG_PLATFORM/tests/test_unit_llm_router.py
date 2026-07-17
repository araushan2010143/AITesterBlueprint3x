"""Unit tests — LLM Router fallback logic (no real LLM calls)."""
import time
import pytest
from unittest.mock import MagicMock, patch
from backend.llm.router import (
    LLMProvider,
    LLMRouter,
    _is_quota_or_rate,
    _is_transient,
)


# ── Helper factories ──────────────────────────────────────────────────────────

def _make_provider(name: str, fn=None, cooldown: int = 3600) -> LLMProvider:
    if fn is None:
        fn = MagicMock(return_value={"answer": f"ok from {name}", "tokens_used": 100})
    return LLMProvider(name=name, fn=fn, cooldown=cooldown)


def _make_router(*providers) -> LLMRouter:
    return LLMRouter(list(providers))


# ── _is_quota_or_rate ─────────────────────────────────────────────────────────

class TestIsQuotaOrRate:

    def test_429_status_code(self):
        exc = MagicMock()
        exc.status_code = 429
        assert _is_quota_or_rate(exc)

    def test_503_status_code(self):
        exc = MagicMock()
        exc.status_code = 503
        assert _is_quota_or_rate(exc)

    def test_response_429(self):
        exc = Exception("error")
        exc.status_code = None
        exc.response = MagicMock()
        exc.response.status_code = 429
        assert _is_quota_or_rate(exc)

    def test_rate_limit_in_message(self):
        exc = Exception("rate limit exceeded")
        assert _is_quota_or_rate(exc)

    def test_quota_in_message(self):
        exc = Exception("quota exceeded for today")
        assert _is_quota_or_rate(exc)

    def test_resource_exhausted_in_message(self):
        exc = Exception("resource_exhausted")
        assert _is_quota_or_rate(exc)

    def test_too_many_requests_in_message(self):
        exc = Exception("too many requests")
        assert _is_quota_or_rate(exc)

    def test_normal_exception_not_quota(self):
        exc = Exception("invalid model name")
        exc.status_code = 400
        assert not _is_quota_or_rate(exc)

    def test_auth_error_not_quota(self):
        exc = Exception("unauthorized")
        assert not _is_quota_or_rate(exc)


# ── _is_transient ─────────────────────────────────────────────────────────────

class TestIsTransient:

    def test_json_validate_failed(self):
        assert _is_transient(Exception("json_validate_failed"))

    def test_invalid_request_error(self):
        assert _is_transient(Exception("invalid_request_error"))

    def test_bad_request(self):
        assert _is_transient(Exception("bad request"))

    def test_422_in_message(self):
        assert _is_transient(Exception("422 unprocessable"))

    def test_auth_error_not_transient(self):
        assert not _is_transient(Exception("authentication failed"))

    def test_connection_error_not_transient(self):
        assert not _is_transient(Exception("connection refused"))


# ── LLMProvider ───────────────────────────────────────────────────────────────

class TestLLMProvider:

    def test_new_provider_is_available(self):
        p = _make_provider("groq")
        assert p.available()

    def test_muted_provider_is_not_available(self):
        p = _make_provider("groq")
        p.mute()
        assert not p.available()

    def test_resets_in_is_positive_when_muted(self):
        p = _make_provider("groq", cooldown=3600)
        p.mute()
        assert p.resets_in() > 0

    def test_resets_in_is_zero_when_available(self):
        p = _make_provider("groq")
        assert p.resets_in() == 0.0

    def test_to_dict_has_name_and_available(self):
        p = _make_provider("groq")
        d = p.to_dict()
        assert d["name"] == "groq"
        assert d["available"] is True
        assert "resets_in_s" in d

    def test_muted_to_dict_available_false(self):
        p = _make_provider("groq")
        p.mute()
        d = p.to_dict()
        assert d["available"] is False


# ── LLMRouter.chat ────────────────────────────────────────────────────────────

class TestLLMRouterChat:

    def test_returns_first_provider_result(self):
        p = _make_provider("groq")
        router = _make_router(p)
        result = router.chat([{"role": "user", "content": "hi"}])
        assert result["answer"] == "ok from groq"

    def test_result_includes_provider_name(self):
        p = _make_provider("groq")
        router = _make_router(p)
        result = router.chat([{"role": "user", "content": "hi"}])
        assert result["provider"] == "groq"

    def test_falls_back_on_quota_error(self):
        def fail(messages, temp, tokens, json_mode):
            exc = Exception("rate limit exceeded")
            exc.status_code = 429
            raise exc

        p1 = LLMProvider("groq", fn=fail, cooldown=1)
        p2 = _make_provider("mistral")
        router = _make_router(p1, p2)
        result = router.chat([{"role": "user", "content": "hi"}])
        assert result["provider"] == "mistral"

    def test_quota_error_mutes_first_provider(self):
        def fail(messages, temp, tokens, json_mode):
            exc = Exception("quota exceeded")
            exc.status_code = 429
            raise exc

        p1 = LLMProvider("groq", fn=fail, cooldown=3600)
        p2 = _make_provider("mistral")
        router = _make_router(p1, p2)
        router.chat([{"role": "user", "content": "hi"}])
        assert not p1.available()

    def test_skips_muted_provider(self):
        p1 = _make_provider("groq")
        p2 = _make_provider("mistral")
        p1.mute()
        router = _make_router(p1, p2)
        result = router.chat([{"role": "user", "content": "hi"}])
        assert result["provider"] == "mistral"
        p1.fn.assert_not_called()

    def test_transient_error_tries_next_without_muting(self):
        call_count = {"n": 0}

        def transient(messages, temp, tokens, json_mode):
            call_count["n"] += 1
            raise Exception("json_validate_failed")

        p1 = LLMProvider("groq", fn=transient, cooldown=3600)
        p2 = _make_provider("mistral")
        router = _make_router(p1, p2)
        result = router.chat([{"role": "user", "content": "hi"}])
        # p1 tried but not muted
        assert p1.available()
        assert result["provider"] == "mistral"

    def test_auth_error_propagates_immediately(self):
        def auth_fail(messages, temp, tokens, json_mode):
            raise ValueError("authentication failed")

        p1 = LLMProvider("groq", fn=auth_fail, cooldown=3600)
        p2 = _make_provider("mistral")
        router = _make_router(p1, p2)
        with pytest.raises(ValueError, match="authentication failed"):
            router.chat([{"role": "user", "content": "hi"}])

    def test_all_muted_raises_runtime_error(self):
        p1 = _make_provider("groq")
        p2 = _make_provider("mistral")
        p1.mute()
        p2.mute()
        router = _make_router(p1, p2)
        with pytest.raises(RuntimeError, match="All LLM providers unavailable"):
            router.chat([{"role": "user", "content": "hi"}])

    def test_max_tokens_capped_to_provider_limit(self):
        received_tokens = {}

        def capture(messages, temp, tokens, json_mode):
            received_tokens["tokens"] = tokens
            return {"answer": "ok", "tokens_used": tokens}

        p = LLMProvider("groq", fn=capture, cooldown=1, max_output_tokens=1000)
        router = _make_router(p)
        router.chat([{"role": "user", "content": "hi"}], max_tokens=5000)
        assert received_tokens["tokens"] == 1000

    def test_max_tokens_within_limit_unchanged(self):
        received_tokens = {}

        def capture(messages, temp, tokens, json_mode):
            received_tokens["tokens"] = tokens
            return {"answer": "ok", "tokens_used": tokens}

        p = LLMProvider("groq", fn=capture, cooldown=1, max_output_tokens=32768)
        router = _make_router(p)
        router.chat([{"role": "user", "content": "hi"}], max_tokens=2048)
        assert received_tokens["tokens"] == 2048


# ── LLMRouter.status / available_count ────────────────────────────────────────

class TestLLMRouterStatus:

    def test_status_returns_list_of_dicts(self):
        p1 = _make_provider("groq")
        p2 = _make_provider("mistral")
        router = _make_router(p1, p2)
        status = router.status()
        assert isinstance(status, list)
        assert len(status) == 2
        assert all("name" in s and "available" in s for s in status)

    def test_available_count_all_up(self):
        router = _make_router(_make_provider("a"), _make_provider("b"))
        assert router.available_count() == 2

    def test_available_count_one_muted(self):
        p1 = _make_provider("groq")
        p2 = _make_provider("mistral")
        p1.mute()
        router = _make_router(p1, p2)
        assert router.available_count() == 1

    def test_available_count_all_muted(self):
        p1 = _make_provider("groq")
        p2 = _make_provider("mistral")
        p1.mute()
        p2.mute()
        router = _make_router(p1, p2)
        assert router.available_count() == 0

    def test_status_reflects_muted_state(self):
        p1 = _make_provider("groq")
        p1.mute()
        router = _make_router(p1)
        status = router.status()
        assert status[0]["available"] is False
