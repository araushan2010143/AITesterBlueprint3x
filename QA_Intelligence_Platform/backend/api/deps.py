"""FastAPI dependencies — JWT auth."""
from __future__ import annotations
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlmodel import Session, select

from database.db import get_session
from database.models import User
from config import get_settings

_bearer = HTTPBearer(auto_error=False)


def _decode(token: str) -> dict:
    s = get_settings()
    return jwt.decode(token, s.jwt_secret, algorithms=["HS256"])


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
) -> User:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not credentials:
        raise exc
    try:
        payload = _decode(credentials.credentials)
        email: str = payload.get("sub", "")
    except JWTError:
        raise exc

    user = session.exec(select(User).where(User.email == email)).first()
    if not user or not user.is_active:
        raise exc
    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
) -> User | None:
    if not credentials:
        return None
    try:
        payload = _decode(credentials.credentials)
        email: str = payload.get("sub", "")
        return session.exec(select(User).where(User.email == email)).first()
    except JWTError:
        return None
