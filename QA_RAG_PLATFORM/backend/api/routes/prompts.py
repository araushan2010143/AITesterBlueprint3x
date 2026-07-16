"""
Prompt versioning API.

Endpoints:
  GET    /api/prompts                    — list distinct prompt names + active version info
  GET    /api/prompts/{name}             — list all stored versions for a name
  GET    /api/prompts/{name}/active      — get the active version content (team-aware)
  POST   /api/prompts                    — create a new version (optionally activate it)
  PUT    /api/prompts/{id}/activate      — activate a version (deactivates others for same name+team)
  PUT    /api/prompts/{id}               — update description only (content is immutable)
  DELETE /api/prompts/{id}               — delete a version (cannot delete active versions)
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.database.db import get_session
from backend.models.prompt_version import PromptVersion
from backend.services.prompt_service import next_version

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/prompts", tags=["Prompt Versioning"])


# ── Pydantic request schemas ──────────────────────────────────────────────────

class CreatePromptRequest(BaseModel):
    name: str
    content: str
    description: Optional[str] = None
    team_id: Optional[str] = None
    created_by: Optional[str] = None
    activate: bool = True


class UpdatePromptRequest(BaseModel):
    description: Optional[str] = None


# ── Internal helpers ──────────────────────────────────────────────────────────

def _deactivate_all(name: str, team_id: Optional[str], db: Session) -> None:
    """Set is_active=False for every currently-active version of name+team_id."""
    stmt = (
        select(PromptVersion)
        .where(PromptVersion.name == name)
        .where(PromptVersion.team_id == team_id)
        .where(PromptVersion.is_active == True)
    )
    for row in db.exec(stmt).all():
        row.is_active = False
        db.add(row)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def list_prompts(
    team_id: Optional[str] = Query(None),
    db: Session = Depends(get_session),
):
    """List distinct prompt names and their active version info."""
    stmt = select(PromptVersion.name).distinct()
    names = db.exec(stmt).all()

    results = []
    for name in names:
        versions = db.exec(
            select(PromptVersion)
            .where(PromptVersion.name == name)
            .order_by(PromptVersion.version.desc())
        ).all()
        active = next((v for v in versions if v.is_active), None)
        results.append({
            "name":             name,
            "version_count":    len(versions),
            "active_version":   active.version if active else None,
            "active_team_id":   active.team_id if active else None,
            "active_id":        active.id if active else None,
        })
    return {"prompts": results, "count": len(results)}


@router.get("/{name}/active")
def get_active(
    name: str,
    team_id: Optional[str] = Query(None),
    db: Session = Depends(get_session),
):
    """Return active prompt content for `name` (team-specific overrides global)."""
    from backend.services.prompt_service import get_active_prompt
    content = get_active_prompt(name, team_id)
    if content is None:
        raise HTTPException(404, f"No active prompt version found for '{name}'")
    return {"name": name, "content": content, "team_id": team_id}


@router.get("/{name}")
def list_versions(
    name: str,
    team_id: Optional[str] = Query(None),
    db: Session = Depends(get_session),
):
    """List all stored versions for a prompt name."""
    stmt = (
        select(PromptVersion)
        .where(PromptVersion.name == name)
        .order_by(PromptVersion.version.desc())
    )
    if team_id:
        stmt = stmt.where(PromptVersion.team_id == team_id)
    rows = db.exec(stmt).all()
    return {
        "name":     name,
        "versions": [
            {
                "id":              r.id,
                "version":         r.version,
                "is_active":       r.is_active,
                "team_id":         r.team_id,
                "description":     r.description,
                "created_by":      r.created_by,
                "created_at":      r.created_at.isoformat(),
                "content_preview": r.content[:200] + ("…" if len(r.content) > 200 else ""),
            }
            for r in rows
        ],
    }


@router.post("", status_code=201)
def create_prompt(req: CreatePromptRequest, db: Session = Depends(get_session)):
    """Create a new prompt version. Set activate=true (default) to make it live immediately."""
    ver = next_version(req.name, req.team_id)
    if req.activate:
        _deactivate_all(req.name, req.team_id, db)

    prompt = PromptVersion(
        name=req.name,
        version=ver,
        content=req.content,
        description=req.description,
        is_active=req.activate,
        team_id=req.team_id,
        created_by=req.created_by,
    )
    db.add(prompt)
    db.commit()
    db.refresh(prompt)
    return {
        "id":        prompt.id,
        "name":      prompt.name,
        "version":   prompt.version,
        "is_active": prompt.is_active,
        "team_id":   prompt.team_id,
    }


@router.put("/{prompt_id}/activate")
def activate_prompt(prompt_id: str, db: Session = Depends(get_session)):
    """Activate a specific version and deactivate all others for the same name+team."""
    prompt = db.get(PromptVersion, prompt_id)
    if not prompt:
        raise HTTPException(404, "Prompt version not found")
    _deactivate_all(prompt.name, prompt.team_id, db)
    prompt.is_active = True
    db.add(prompt)
    db.commit()
    return {"id": prompt_id, "activated": True, "version": prompt.version}


@router.put("/{prompt_id}")
def update_prompt(prompt_id: str, req: UpdatePromptRequest, db: Session = Depends(get_session)):
    """Update description only. To change content, create a new version."""
    prompt = db.get(PromptVersion, prompt_id)
    if not prompt:
        raise HTTPException(404, "Prompt version not found")
    if req.description is not None:
        prompt.description = req.description
    db.add(prompt)
    db.commit()
    return {"id": prompt_id, "updated": True}


@router.delete("/{prompt_id}")
def delete_prompt(prompt_id: str, db: Session = Depends(get_session)):
    """Delete a prompt version. Active versions cannot be deleted — activate another first."""
    prompt = db.get(PromptVersion, prompt_id)
    if not prompt:
        raise HTTPException(404, "Prompt version not found")
    if prompt.is_active:
        raise HTTPException(
            409,
            "Cannot delete an active prompt version. "
            "Activate a different version first, then delete this one.",
        )
    db.delete(prompt)
    db.commit()
    return {"id": prompt_id, "deleted": True}
