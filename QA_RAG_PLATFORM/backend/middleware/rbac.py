"""RBAC dependency — resolves current user from Bearer JWT and enforces roles."""
from typing import Optional
from fastapi import Header, HTTPException, Depends
from sqlmodel import Session, select
from jose import JWTError

from backend.database.db import get_session
from backend.models.user import User
from backend.services.auth_service import decode_token


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_session),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expired or invalid")

    user = db.exec(select(User).where(User.id == payload["sub"])).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or deactivated")
    return user


def get_current_user_optional(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_session),
) -> Optional[User]:
    """Returns None instead of 401 — for endpoints that work both auth'd and anonymous."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        token = authorization.split(" ", 1)[1]
        payload = decode_token(token)
        return db.exec(select(User).where(User.id == payload["sub"])).first()
    except Exception:
        return None


def require_role(*roles: str):
    """FastAPI dependency factory: raises 403 if current user's role isn't in `roles`."""
    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{user.role}' cannot access this endpoint. Required: {list(roles)}",
            )
        return user
    return _dep


# Convenience aliases
require_admin  = require_role("admin")
require_member = require_role("admin", "user")
require_any    = require_role("admin", "user", "viewer")
