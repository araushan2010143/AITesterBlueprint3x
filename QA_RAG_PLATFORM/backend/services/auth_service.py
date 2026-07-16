"""JWT authentication + password hashing utilities."""
import hashlib
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional, Tuple

from jose import jwt, JWTError
from passlib.context import CryptContext

_SECRET = os.getenv("JWT_SECRET", "CHANGE_ME_IN_PRODUCTION_min32chars!!")
_ALGORITHM = "HS256"
_EXPIRE_MINUTES        = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))       # 1 h access tokens
_REFRESH_EXPIRE_DAYS   = int(os.getenv("JWT_REFRESH_EXPIRE_DAYS", "30"))  # 30 d refresh tokens
_MAX_SESSIONS_PER_USER = int(os.getenv("JWT_MAX_SESSIONS", "5"))          # concurrent sessions

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def create_access_token(
    user_id: str,
    email: str,
    role: str,
    team_id: Optional[str] = None,
) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "team_id": team_id,
        "exp": datetime.utcnow() + timedelta(minutes=_EXPIRE_MINUTES),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALGORITHM)


def decode_token(token: str) -> dict:
    """Raises JWTError on invalid / expired tokens."""
    return jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])


# ── Refresh token utilities ────────────────────────────────────────────────────

def _hash_token(raw: str) -> str:
    """SHA-256 hash of a raw token string (stored in DB, never the raw value)."""
    return hashlib.sha256(raw.encode()).hexdigest()


def create_refresh_token(
    user_id: str,
    team_id: Optional[str] = None,
    device_hint: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> Tuple[str, "RefreshToken"]:  # noqa: F821
    """
    Generate a new refresh token, persist it, and return (raw_token, model_instance).
    The raw token is returned once and never stored — only its hash is persisted.
    Also enforces the max-sessions-per-user limit by revoking the oldest session.
    """
    from sqlmodel import Session, select
    from backend.database.db import engine
    from backend.models.refresh_token import RefreshToken

    raw = secrets.token_urlsafe(48)   # 64-char URL-safe string
    token_hash = _hash_token(raw)
    expires_at = datetime.utcnow() + timedelta(days=_REFRESH_EXPIRE_DAYS)

    with Session(engine) as db:
        # Enforce session cap: revoke oldest if over limit
        active = db.exec(
            select(RefreshToken)
            .where(RefreshToken.user_id == user_id)
            .where(RefreshToken.revoked_at == None)
            .where(RefreshToken.used_at == None)
            .where(RefreshToken.expires_at > datetime.utcnow())
            .order_by(RefreshToken.created_at.asc())
        ).all()
        if len(active) >= _MAX_SESSIONS_PER_USER:
            for old in active[: len(active) - _MAX_SESSIONS_PER_USER + 1]:
                old.revoked_at = datetime.utcnow()
                db.add(old)

        rt = RefreshToken(
            token_hash=token_hash,
            user_id=user_id,
            team_id=team_id,
            expires_at=expires_at,
            device_hint=device_hint,
            ip_address=ip_address,
        )
        db.add(rt)
        db.commit()
        db.refresh(rt)

    return raw, rt


def rotate_refresh_token(
    raw_token: str,
    user_id: str,
    team_id: Optional[str] = None,
    device_hint: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> Optional[Tuple[str, "RefreshToken"]]:  # noqa: F821
    """
    Validate and rotate a refresh token.
    Marks the old token as used, issues a new one.
    Returns (new_raw_token, new_model) or None if the token is invalid.
    """
    from sqlmodel import Session, select
    from backend.database.db import engine
    from backend.models.refresh_token import RefreshToken

    token_hash = _hash_token(raw_token)
    with Session(engine) as db:
        rt = db.exec(
            select(RefreshToken)
            .where(RefreshToken.token_hash == token_hash)
            .where(RefreshToken.user_id == user_id)
        ).first()

        if rt is None or not rt.is_valid:
            return None

        # Mark consumed (rotation — old token can't be reused)
        rt.used_at = datetime.utcnow()
        db.add(rt)
        db.commit()

    return create_refresh_token(
        user_id=user_id,
        team_id=team_id,
        device_hint=device_hint or rt.device_hint,
        ip_address=ip_address or rt.ip_address,
    )


def revoke_refresh_token(raw_token: str) -> bool:
    """Revoke a specific refresh token. Returns True if found and revoked."""
    from sqlmodel import Session, select
    from backend.database.db import engine
    from backend.models.refresh_token import RefreshToken

    token_hash = _hash_token(raw_token)
    with Session(engine) as db:
        rt = db.exec(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        ).first()
        if rt is None:
            return False
        rt.revoked_at = datetime.utcnow()
        db.add(rt)
        db.commit()
    return True


def revoke_session(session_id: str, user_id: str) -> bool:
    """Revoke a session by its DB id (must belong to user_id)."""
    from sqlmodel import Session
    from backend.database.db import engine
    from backend.models.refresh_token import RefreshToken

    with Session(engine) as db:
        rt = db.get(RefreshToken, session_id)
        if rt is None or rt.user_id != user_id:
            return False
        rt.revoked_at = datetime.utcnow()
        db.add(rt)
        db.commit()
    return True


def _mask(value: str, visible: int = 4) -> str:
    if not value:
        return ""
    return value[:visible] + "***"


def mask_pat(repo_url: str) -> str:
    """Remove bearer tokens / PATs from URLs before logging."""
    import re
    return re.sub(r'(https?://)([^:@/]+:[^@/]+@)', r'\1***@', repo_url)
