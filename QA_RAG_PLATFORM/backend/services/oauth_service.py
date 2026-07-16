"""
Google OAuth2 / OIDC SSO service.

Required env vars:
  GOOGLE_CLIENT_ID     — from Google Cloud Console (OAuth 2.0 client ID)
  GOOGLE_CLIENT_SECRET — from Google Cloud Console
  OAUTH_REDIRECT_BASE  — e.g. https://yourapp.com  (no trailing slash)

Flow:
  1. GET /api/auth/oauth/google          → returns {"url": "<Google consent URL>"}
  2. User redirects to Google
  3. GET /api/auth/oauth/google/callback → exchanges code, creates/updates user, returns JWT
"""
import json
import logging
import os
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
_REDIRECT_BASE = os.getenv("OAUTH_REDIRECT_BASE", "http://localhost:3000").rstrip("/")
_REDIRECT_URI = f"{_REDIRECT_BASE}/api/auth/oauth/google/callback"

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

_SCOPES = ["openid", "email", "profile"]


def is_configured() -> bool:
    return bool(_CLIENT_ID and _CLIENT_SECRET)


def get_authorization_url(state: str = "") -> str:
    """Build the Google consent screen URL."""
    params = {
        "client_id": _CLIENT_ID,
        "redirect_uri": _REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(_SCOPES),
        "access_type": "offline",
        "prompt": "select_account",
    }
    if state:
        params["state"] = state
    return f"{_GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"


def exchange_code(code: str) -> Tuple[Optional[dict], Optional[str]]:
    """
    Exchange authorization code for user profile.
    Returns (user_info_dict, error_message).
    user_info_dict keys: id, email, name, picture
    """
    if not is_configured():
        return None, "Google OAuth is not configured on this server"

    # Step 1: exchange code for tokens
    token_data = urllib.parse.urlencode({
        "code": code,
        "client_id": _CLIENT_ID,
        "client_secret": _CLIENT_SECRET,
        "redirect_uri": _REDIRECT_URI,
        "grant_type": "authorization_code",
    }).encode()

    try:
        req = urllib.request.Request(
            _GOOGLE_TOKEN_URL, data=token_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            token_resp = json.loads(resp.read())
    except Exception as exc:
        logger.error("Google token exchange failed: %s", exc)
        return None, f"Token exchange failed: {exc}"

    access_token = token_resp.get("access_token")
    if not access_token:
        return None, f"No access_token in Google response: {token_resp.get('error_description', 'unknown')}"

    # Step 2: fetch userinfo
    try:
        req = urllib.request.Request(
            _GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            user_info = json.loads(resp.read())
    except Exception as exc:
        logger.error("Google userinfo fetch failed: %s", exc)
        return None, f"Userinfo fetch failed: {exc}"

    return {
        "id": user_info.get("id", ""),
        "email": user_info.get("email", ""),
        "name": user_info.get("name", ""),
        "picture": user_info.get("picture", ""),
        "verified": user_info.get("verified_email", False),
    }, None


def upsert_oauth_user(db_session, user_info: dict):
    """
    Find or create a User record for the OAuth identity.
    Returns the User ORM object.
    """
    from sqlmodel import select
    from backend.models.user import User
    from backend.services.auth_service import hash_password
    import uuid

    email = user_info.get("email", "").lower().strip()
    if not email:
        raise ValueError("OAuth user has no email")

    existing = db_session.exec(select(User).where(User.email == email)).first()
    if existing:
        # Update name/avatar if changed
        existing.name = user_info.get("name", existing.name)
        existing.updated_at = datetime.utcnow()
        db_session.add(existing)
        db_session.commit()
        db_session.refresh(existing)
        return existing

    # First user ever → admin
    from sqlmodel import func
    count = db_session.exec(select(func.count()).select_from(User)).one()
    role = "admin" if count == 0 else "user"

    user = User(
        id=str(uuid.uuid4()),
        email=email,
        name=user_info.get("name", email.split("@")[0]),
        hashed_password=hash_password(str(uuid.uuid4())),  # random unguessable password
        role=role,
        is_active=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user
