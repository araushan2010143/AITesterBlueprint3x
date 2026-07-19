"""Auth endpoints — register, login, me."""
from __future__ import annotations
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select

from database.db import get_session
from database.models import User
from api.deps import get_current_user

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str = ""

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    id: int
    email: str
    name: str
    created_at: datetime


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash(password: str) -> str:
    from passlib.context import CryptContext
    return CryptContext(schemes=["bcrypt"]).hash(password)

def _verify(plain: str, hashed: str) -> bool:
    from passlib.context import CryptContext
    return CryptContext(schemes=["bcrypt"]).verify(plain, hashed)

def _make_token(email: str) -> str:
    from jose import jwt
    from config import get_settings
    s = get_settings()
    expire = datetime.utcnow() + timedelta(minutes=s.jwt_expire_minutes)
    return jwt.encode({"sub": email, "exp": expire}, s.jwt_secret, algorithm="HS256")


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterRequest, session: Session = Depends(get_session)):
    if session.exec(select(User).where(User.email == body.email)).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    if len(body.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    user = User(
        email=body.email,
        name=body.name or body.email.split("@")[0],
        hashed_password=_hash(body.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserOut(id=user.id, email=user.email, name=user.name, created_at=user.created_at)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == body.email)).first()
    if not user or not _verify(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    return TokenResponse(access_token=_make_token(user.email))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        created_at=current_user.created_at,
    )
