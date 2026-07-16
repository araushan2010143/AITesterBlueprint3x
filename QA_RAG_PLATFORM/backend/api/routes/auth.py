"""Authentication + Team management routes."""
import re
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, field_validator
from sqlmodel import Session, select

from backend.database.db import get_session
from backend.models.user import User
from backend.models.team import Team
from backend.models.team_member import TeamMember
from backend.services.auth_service import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, rotate_refresh_token, revoke_refresh_token, revoke_session,
)
from backend.middleware.rbac import get_current_user, require_role

router = APIRouter(tags=["auth"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    email: str
    password: str
    name: str = ""

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str = ""
    token_type: str = "bearer"
    user: dict


class RefreshIn(BaseModel):
    refresh_token: str


class LogoutIn(BaseModel):
    refresh_token: str


class TeamCreateIn(BaseModel):
    name: str
    description: str = ""


class InviteIn(BaseModel):
    email: str
    role: str = "user"


class RoleUpdateIn(BaseModel):
    role: str


# ── Auth endpoints ─────────────────────────────────────────────────────────────

@router.post("/api/auth/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_session)):
    if db.exec(select(User).where(User.email == body.email.lower())).first():
        raise HTTPException(400, "Email already registered")

    user = User(
        email=body.email.lower(),
        hashed_password=hash_password(body.password),
        name=body.name or body.email.split("@")[0],
        role="admin",   # first user gets admin; subsequent users default to "user"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token = create_access_token(user.id, user.email, user.role, user.team_id)
    raw_refresh, _ = create_refresh_token(user.id, team_id=user.team_id)
    return TokenOut(access_token=access_token, refresh_token=raw_refresh, user=_user_dict(user))


@router.post("/api/auth/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_session)):
    user = db.exec(select(User).where(User.email == body.email.lower())).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(403, "Account deactivated")

    access_token = create_access_token(user.id, user.email, user.role, user.team_id)
    raw_refresh, _ = create_refresh_token(user.id, team_id=user.team_id)
    return TokenOut(access_token=access_token, refresh_token=raw_refresh, user=_user_dict(user))


@router.post("/api/auth/refresh")
def refresh_token(body: RefreshIn, db: Session = Depends(get_session)):
    """
    Exchange a valid refresh token for a new access token + refresh token pair.
    The old refresh token is immediately invalidated (rotation).
    """
    from backend.services.auth_service import _hash_token
    from backend.models.refresh_token import RefreshToken
    from sqlmodel import select as _select
    token_hash = _hash_token(body.refresh_token)
    rt = db.exec(
        _select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    ).first()
    if rt is None or not rt.is_valid:
        raise HTTPException(401, "Refresh token is invalid or expired")

    user = db.get(User, rt.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "User account not found or deactivated")

    pair = rotate_refresh_token(body.refresh_token, user.id, team_id=user.team_id)
    if pair is None:
        raise HTTPException(401, "Refresh token rotation failed — please log in again")

    new_raw, _ = pair
    access_token = create_access_token(user.id, user.email, user.role, user.team_id)
    return {"access_token": access_token, "refresh_token": new_raw, "token_type": "bearer"}


@router.post("/api/auth/logout")
def logout(body: LogoutIn):
    """Revoke a refresh token (log out this session)."""
    revoke_refresh_token(body.refresh_token)
    return {"message": "Logged out"}


@router.get("/api/auth/sessions")
def list_sessions(current_user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """List active refresh token sessions for the current user."""
    from backend.models.refresh_token import RefreshToken
    from sqlmodel import select as _select
    sessions = db.exec(
        _select(RefreshToken)
        .where(RefreshToken.user_id == current_user.id)
        .where(RefreshToken.revoked_at == None)
        .where(RefreshToken.used_at == None)
        .where(RefreshToken.expires_at > datetime.utcnow())
        .order_by(RefreshToken.created_at.desc())
    ).all()
    return {
        "sessions": [
            {
                "id":           s.id,
                "device_hint":  s.device_hint,
                "ip_address":   s.ip_address,
                "created_at":   s.created_at.isoformat(),
                "expires_at":   s.expires_at.isoformat(),
            }
            for s in sessions
        ]
    }


@router.delete("/api/auth/sessions/{session_id}")
def delete_session(session_id: str, current_user: User = Depends(get_current_user)):
    """Revoke a specific session by its ID."""
    if not revoke_session(session_id, current_user.id):
        raise HTTPException(404, "Session not found or not owned by you")
    return {"message": "Session revoked", "session_id": session_id}


@router.get("/api/auth/me")
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    team = db.get(Team, current_user.team_id) if current_user.team_id else None
    return {**_user_dict(current_user), "team": _team_dict(team) if team else None}


@router.patch("/api/auth/me")
def update_me(body: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    if "name" in body:
        current_user.name = str(body["name"])[:100]
    if "password" in body:
        if len(str(body["password"])) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")
        current_user.hashed_password = hash_password(body["password"])
    current_user.updated_at = datetime.utcnow()
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return _user_dict(current_user)


# ── Team endpoints ─────────────────────────────────────────────────────────────

@router.post("/api/teams", status_code=201)
def create_team(
    body: TeamCreateIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    slug = _slugify(body.name)
    if db.exec(select(Team).where(Team.slug == slug)).first():
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    team = Team(name=body.name, slug=slug, description=body.description, owner_id=current_user.id)
    db.add(team)
    db.flush()

    # Make creator admin of the team
    db.add(TeamMember(team_id=team.id, user_id=current_user.id, role="admin"))

    current_user.team_id = team.id
    current_user.role = "admin"
    current_user.updated_at = datetime.utcnow()
    db.add(current_user)
    db.commit()
    db.refresh(team)

    new_token = create_access_token(current_user.id, current_user.email, "admin", team.id)
    return {"team": _team_dict(team), "access_token": new_token}


@router.get("/api/teams/current")
def get_team(current_user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    if not current_user.team_id:
        raise HTTPException(404, "Not a member of any team")
    team = db.get(Team, current_user.team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    return _team_dict(team)


@router.get("/api/teams/members")
def list_members(current_user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    if not current_user.team_id:
        return {"members": []}
    members = db.exec(select(TeamMember).where(TeamMember.team_id == current_user.team_id)).all()
    result = []
    for m in members:
        user = db.get(User, m.user_id)
        if user:
            result.append({
                "user_id": user.id,
                "email": user.email,
                "name": user.name,
                "role": m.role,
                "joined_at": m.joined_at.isoformat(),
            })
    return {"members": result}


@router.post("/api/teams/invite")
def invite_member(
    body: InviteIn,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    if not current_user.team_id:
        raise HTTPException(400, "You are not part of a team")
    invitee = db.exec(select(User).where(User.email == body.email.lower())).first()
    if not invitee:
        raise HTTPException(404, "User not found — they must register first")
    existing = db.exec(
        select(TeamMember).where(
            TeamMember.team_id == current_user.team_id,
            TeamMember.user_id == invitee.id,
        )
    ).first()
    if existing:
        raise HTTPException(400, "User is already a member")

    db.add(TeamMember(
        team_id=current_user.team_id,
        user_id=invitee.id,
        role=body.role,
        invited_by=current_user.id,
    ))
    invitee.team_id = current_user.team_id
    invitee.role = body.role
    invitee.updated_at = datetime.utcnow()
    db.add(invitee)
    db.commit()
    return {"message": f"{invitee.email} added to team as {body.role}"}


@router.patch("/api/teams/members/{user_id}/role")
def update_member_role(
    user_id: str,
    body: RoleUpdateIn,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    if body.role not in ("admin", "user", "viewer"):
        raise HTTPException(400, "Role must be admin, user, or viewer")
    member = db.exec(
        select(TeamMember).where(
            TeamMember.team_id == current_user.team_id,
            TeamMember.user_id == user_id,
        )
    ).first()
    if not member:
        raise HTTPException(404, "Member not found")
    member.role = body.role
    db.add(member)
    user = db.get(User, user_id)
    if user:
        user.role = body.role
        user.updated_at = datetime.utcnow()
        db.add(user)
    db.commit()
    return {"message": "Role updated"}


@router.delete("/api/teams/members/{user_id}")
def remove_member(
    user_id: str,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    member = db.exec(
        select(TeamMember).where(
            TeamMember.team_id == current_user.team_id,
            TeamMember.user_id == user_id,
        )
    ).first()
    if not member:
        raise HTTPException(404, "Member not found")
    db.delete(member)
    user = db.get(User, user_id)
    if user:
        user.team_id = None
        user.role = "user"
        user.updated_at = datetime.utcnow()
        db.add(user)
    db.commit()
    return {"message": "Member removed"}


@router.get("/api/teams/audit-log")
def audit_log(
    limit: int = 50,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_session),
):
    from backend.models.audit_log import AuditLog
    from sqlmodel import select, desc
    logs = db.exec(select(AuditLog).order_by(desc(AuditLog.timestamp)).limit(limit)).all()
    return {"logs": [
        {
            "id": l.id,
            "timestamp": l.timestamp.isoformat(),
            "method": l.method,
            "path": l.path,
            "ip": l.ip_address,
            "status": l.status_code,
            "ms": l.response_ms,
        }
        for l in logs
    ]}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "role": u.role,
        "team_id": u.team_id,
        "created_at": u.created_at.isoformat(),
    }


def _team_dict(t: Team) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "slug": t.slug,
        "description": t.description,
        "plan": t.plan,
        "owner_id": t.owner_id,
        "created_at": t.created_at.isoformat(),
    }


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]


# ── OAuth2 / SSO ──────────────────────────────────────────────────────────────

@router.get("/api/auth/oauth/google")
def google_oauth_start():
    """Return the Google consent URL. Frontend redirects the browser to it."""
    from backend.services.oauth_service import get_authorization_url, is_configured
    if not is_configured():
        raise HTTPException(status_code=503, detail="Google OAuth is not configured on this server")
    url = get_authorization_url()
    return {"url": url, "provider": "google"}


@router.get("/api/auth/oauth/google/callback")
def google_oauth_callback(code: str, state: str = "", db: Session = Depends(get_session)):
    """
    Google redirects here with ?code=... after user consents.
    Exchanges the code for a user profile, upserts the user, returns a JWT.
    """
    from backend.services.oauth_service import exchange_code, upsert_oauth_user
    user_info, error = exchange_code(code)
    if error:
        raise HTTPException(status_code=400, detail=error)
    try:
        user = upsert_oauth_user(db, user_info)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    token = create_access_token(user.id, user.email, user.role, user.team_id)
    return {
        "token": token,
        "user": _user_dict(user),
        "provider": "google",
    }


@router.get("/api/auth/oauth/status")
def oauth_status():
    """Returns which OAuth providers are configured."""
    from backend.services.oauth_service import is_configured
    return {
        "google": is_configured(),
    }
