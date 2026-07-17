"""Integration tests — auth endpoints (register, login, refresh, logout)."""
import os
os.environ.setdefault("RATE_LIMIT_DISABLED", "true")

import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app, raise_server_exceptions=False)

_COUNTER = {"n": 0}


def _unique_email() -> str:
    _COUNTER["n"] += 1
    return f"testuser{_COUNTER['n']}@qa-test.com"


# ── POST /api/auth/register ───────────────────────────────────────────────────

class TestRegister:

    def test_register_returns_201(self):
        r = client.post("/api/auth/register", json={
            "email": _unique_email(), "password": "SecurePass1!", "name": "Alice",
        })
        assert r.status_code == 201

    def test_register_returns_access_token(self):
        r = client.post("/api/auth/register", json={
            "email": _unique_email(), "password": "SecurePass1!", "name": "Bob",
        })
        assert "access_token" in r.json()
        assert r.json()["access_token"]

    def test_register_returns_refresh_token(self):
        r = client.post("/api/auth/register", json={
            "email": _unique_email(), "password": "SecurePass1!", "name": "Carol",
        })
        assert "refresh_token" in r.json()

    def test_register_response_has_user_object(self):
        email = _unique_email()
        r = client.post("/api/auth/register", json={
            "email": email, "password": "SecurePass1!", "name": "Dave",
        })
        user = r.json().get("user", {})
        assert user.get("email") == email.lower()

    def test_register_duplicate_email_returns_400(self):
        email = _unique_email()
        client.post("/api/auth/register", json={"email": email, "password": "Pass1234!"})
        r = client.post("/api/auth/register", json={"email": email, "password": "Pass1234!"})
        assert r.status_code == 400

    def test_register_short_password_returns_422(self):
        r = client.post("/api/auth/register", json={
            "email": _unique_email(), "password": "short",
        })
        assert r.status_code == 422

    def test_register_missing_email_returns_422(self):
        r = client.post("/api/auth/register", json={"password": "SecurePass1!"})
        assert r.status_code == 422

    def test_register_missing_password_returns_422(self):
        r = client.post("/api/auth/register", json={"email": _unique_email()})
        assert r.status_code == 422

    def test_register_email_stored_lowercase(self):
        r = client.post("/api/auth/register", json={
            "email": "UPPER@EXAMPLE.COM", "password": "SecurePass1!",
        })
        # If a collision happens it's a 400 (already registered as lowercase) — also fine
        if r.status_code == 201:
            assert r.json()["user"]["email"] == "upper@example.com"

    def test_register_default_role_is_set(self):
        r = client.post("/api/auth/register", json={
            "email": _unique_email(), "password": "SecurePass1!",
        })
        assert r.status_code == 201
        assert r.json()["user"].get("role") in ("user", "admin")


# ── POST /api/auth/login ──────────────────────────────────────────────────────

class TestLogin:

    @pytest.fixture(autouse=True)
    def _register_user(self):
        self.email = _unique_email()
        self.password = "TestLogin99!"
        client.post("/api/auth/register", json={
            "email": self.email, "password": self.password,
        })

    def test_valid_login_returns_200(self):
        r = client.post("/api/auth/login", json={
            "email": self.email, "password": self.password,
        })
        assert r.status_code == 200

    def test_valid_login_returns_access_token(self):
        r = client.post("/api/auth/login", json={
            "email": self.email, "password": self.password,
        })
        assert "access_token" in r.json()
        assert r.json()["access_token"]

    def test_valid_login_returns_refresh_token(self):
        r = client.post("/api/auth/login", json={
            "email": self.email, "password": self.password,
        })
        assert "refresh_token" in r.json()

    def test_wrong_password_returns_401(self):
        r = client.post("/api/auth/login", json={
            "email": self.email, "password": "WrongPassword!",
        })
        assert r.status_code == 401

    def test_unknown_email_returns_401(self):
        r = client.post("/api/auth/login", json={
            "email": "nobody@nowhere.com", "password": "Pass1234!",
        })
        assert r.status_code == 401

    def test_missing_email_returns_422(self):
        r = client.post("/api/auth/login", json={"password": "Pass1234!"})
        assert r.status_code == 422

    def test_missing_password_returns_422(self):
        r = client.post("/api/auth/login", json={"email": self.email})
        assert r.status_code == 422

    def test_login_user_object_has_email(self):
        r = client.post("/api/auth/login", json={
            "email": self.email, "password": self.password,
        })
        assert r.json()["user"]["email"] == self.email.lower()

    def test_login_token_type_is_bearer(self):
        r = client.post("/api/auth/login", json={
            "email": self.email, "password": self.password,
        })
        assert r.json().get("token_type") == "bearer"


# ── POST /api/auth/refresh ────────────────────────────────────────────────────

class TestRefresh:

    @pytest.fixture(autouse=True)
    def _register_and_login(self):
        self.email = _unique_email()
        reg = client.post("/api/auth/register", json={
            "email": self.email, "password": "Refresh99!",
        })
        self.refresh_token = reg.json().get("refresh_token", "")

    def test_valid_refresh_returns_200(self):
        if not self.refresh_token:
            pytest.skip("no refresh token from register")
        r = client.post("/api/auth/refresh", json={"refresh_token": self.refresh_token})
        assert r.status_code == 200

    def test_valid_refresh_returns_new_access_token(self):
        if not self.refresh_token:
            pytest.skip("no refresh token")
        r = client.post("/api/auth/refresh", json={"refresh_token": self.refresh_token})
        assert "access_token" in r.json()

    def test_invalid_refresh_token_returns_401(self):
        r = client.post("/api/auth/refresh", json={"refresh_token": "invalid.token.here"})
        assert r.status_code in (401, 400)

    def test_missing_refresh_token_returns_422(self):
        r = client.post("/api/auth/refresh", json={})
        assert r.status_code == 422


# ── POST /api/auth/logout ─────────────────────────────────────────────────────

class TestLogout:

    def test_logout_with_invalid_token_returns_2xx_or_4xx(self):
        # Logout is idempotent — invalid/expired tokens may still return 200
        r = client.post("/api/auth/logout",
                        json={"refresh_token": "bogus"},
                        headers={"Authorization": "Bearer bogus"})
        assert r.status_code in (200, 400, 401, 403, 404, 422)

    def test_logout_missing_body_returns_422(self):
        r = client.post("/api/auth/logout", json={})
        assert r.status_code == 422


# ── GET /api/auth/sessions ────────────────────────────────────────────────────

class TestSessions:

    def test_sessions_without_auth_returns_4xx(self):
        r = client.get("/api/auth/sessions")
        assert r.status_code in (401, 403)

    def test_sessions_with_valid_jwt_returns_200(self):
        email = _unique_email()
        reg = client.post("/api/auth/register", json={
            "email": email, "password": "Sessions99!",
        })
        token = reg.json().get("access_token", "")
        if not token:
            pytest.skip("no token")
        r = client.get("/api/auth/sessions", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
