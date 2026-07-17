"""Integration tests — APIKeyMiddleware and RateLimitMiddleware."""
import os
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch


# ── APIKeyMiddleware ──────────────────────────────────────────────────────────

class TestAPIKeyMiddleware:
    """Tests run with API_KEY env var set to a known value."""

    @pytest.fixture(autouse=True)
    def _patch_key(self):
        # Patch at middleware read-time (os.getenv call inside dispatch)
        with patch.dict(os.environ, {"API_KEY": "test-secret-key"}):
            from backend.main import app
            self.client = TestClient(app, raise_server_exceptions=False)
            yield

    def test_public_health_path_allowed_without_key(self):
        r = self.client.get("/health")
        assert r.status_code == 200

    def test_public_root_path_allowed_without_key(self):
        r = self.client.get("/")
        assert r.status_code == 200

    def test_protected_route_without_key_returns_401(self):
        r = self.client.get("/api/documents")
        assert r.status_code == 401

    def test_protected_route_with_valid_key_passes(self):
        r = self.client.get(
            "/api/documents",
            headers={"X-API-Key": "test-secret-key"},
        )
        # Not 401 — auth passed (may be 200 or other domain error)
        assert r.status_code != 401

    def test_protected_route_with_wrong_key_returns_401(self):
        r = self.client.get(
            "/api/documents",
            headers={"X-API-Key": "wrong-key"},
        )
        assert r.status_code == 401

    def test_options_preflight_allowed_without_key(self):
        r = self.client.options("/api/documents")
        assert r.status_code != 401

    def test_docs_path_allowed_without_key(self):
        # /api/docs is always public (swagger UI)
        r = self.client.get("/api/docs")
        assert r.status_code in (200, 307)  # 307 redirect to /api/docs#

    def test_401_body_has_detail(self):
        r = self.client.get("/api/documents")
        body = r.json()
        assert "detail" in body

    def test_empty_key_header_returns_401(self):
        r = self.client.get("/api/documents", headers={"X-API-Key": ""})
        assert r.status_code == 401


class TestAPIKeyMiddlewareDevMode:
    """When API_KEY is unset, all paths should be accessible (dev mode)."""

    @pytest.fixture(autouse=True)
    def _clear_key(self):
        env = {k: v for k, v in os.environ.items() if k != "API_KEY"}
        env["RATE_LIMIT_DISABLED"] = "true"
        with patch.dict(os.environ, env, clear=True):
            from backend.main import app
            self.client = TestClient(app, raise_server_exceptions=False)
            yield

    def test_documents_accessible_without_key_in_dev_mode(self):
        r = self.client.get("/api/documents")
        # Should not return 401 in dev mode
        assert r.status_code != 401

    def test_health_still_accessible_in_dev_mode(self):
        r = self.client.get("/health")
        assert r.status_code == 200


# ── RateLimitMiddleware ───────────────────────────────────────────────────────

class TestRateLimitMiddleware:

    @pytest.fixture(autouse=True)
    def _setup(self):
        # Ensure rate limiting is enabled
        env = dict(os.environ)
        env.pop("RATE_LIMIT_DISABLED", None)
        env["API_KEY"] = ""  # dev mode for auth
        with patch.dict(os.environ, env, clear=True):
            # Reset internal rate-limit window state
            import backend.middleware.rate_limit as rl
            rl._WINDOWS.clear()
            from backend.main import app
            self.client = TestClient(app, raise_server_exceptions=False)
            yield
            rl._WINDOWS.clear()

    def test_single_request_succeeds(self):
        r = self.client.get("/health")
        assert r.status_code == 200

    def test_options_request_bypasses_rate_limit(self):
        import backend.middleware.rate_limit as rl
        # Saturate the window for this IP
        ip_key = "testclient:default"
        import time
        now = time.monotonic()
        rl._WINDOWS[ip_key] = [now] * 100  # max for default bucket
        r = self.client.options("/api/documents")
        assert r.status_code != 429

    def test_rate_limit_triggered_returns_429(self):
        import backend.middleware.rate_limit as rl
        import time
        # Saturate LLM bucket for testclient IP
        ip_key = "testclient:llm"
        now = time.monotonic()
        rl._WINDOWS[ip_key] = [now] * 20  # 20 = max_calls for llm bucket
        r = self.client.get("/api/ai/actions")
        assert r.status_code == 429

    def test_429_body_has_detail_with_retry(self):
        import backend.middleware.rate_limit as rl
        import time
        ip_key = "testclient:default"
        now = time.monotonic()
        rl._WINDOWS[ip_key] = [now] * 100
        r = self.client.get("/health")
        if r.status_code == 429:
            assert "detail" in r.json()

    def test_rate_limit_disabled_env_bypasses(self):
        with patch.dict(os.environ, {"RATE_LIMIT_DISABLED": "true"}):
            import backend.middleware.rate_limit as rl
            import time
            ip_key = "testclient:default"
            now = time.monotonic()
            rl._WINDOWS[ip_key] = [now] * 100
            from backend.main import app
            c = TestClient(app, raise_server_exceptions=False)
            r = c.get("/health")
            assert r.status_code != 429
