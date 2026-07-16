"""
Prompt versioning service.

Agents call get_active_prompt(name, team_id) at prompt-build time to check
whether an operator has stored a custom prompt for that agent. Lookup order:

  1. Active PromptVersion with matching name AND team_id  (team override)
  2. Active PromptVersion with matching name AND team_id IS NULL  (global)
  3. None → caller falls back to its hardcoded default prompt

This lets teams A/B-test prompts without redeploying code.
"""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def get_active_prompt(name: str, team_id: Optional[str] = None) -> Optional[str]:
    """
    Return the active prompt content for `name`, or None if no version is stored.
    Team-specific version takes priority over global version.
    """
    try:
        from sqlmodel import Session, select
        from backend.database.db import engine
        from backend.models.prompt_version import PromptVersion

        with Session(engine) as db:
            # 1. Team-specific
            if team_id:
                row = db.exec(
                    select(PromptVersion)
                    .where(PromptVersion.name == name)
                    .where(PromptVersion.team_id == team_id)
                    .where(PromptVersion.is_active == True)
                    .order_by(PromptVersion.version.desc())
                    .limit(1)
                ).first()
                if row:
                    return row.content

            # 2. Global fallback (team_id IS NULL)
            row = db.exec(
                select(PromptVersion)
                .where(PromptVersion.name == name)
                .where(PromptVersion.team_id == None)
                .where(PromptVersion.is_active == True)
                .order_by(PromptVersion.version.desc())
                .limit(1)
            ).first()
            return row.content if row else None

    except Exception as exc:
        logger.warning("get_active_prompt(%s) failed: %s", name, exc)
        return None


def next_version(name: str, team_id: Optional[str] = None) -> int:
    """Return the next auto-increment version number for a prompt name+team_id pair."""
    try:
        from sqlmodel import Session, select
        from backend.database.db import engine
        from backend.models.prompt_version import PromptVersion

        with Session(engine) as db:
            row = db.exec(
                select(PromptVersion.version)
                .where(PromptVersion.name == name)
                .where(PromptVersion.team_id == team_id)
                .order_by(PromptVersion.version.desc())
                .limit(1)
            ).first()
            return (row + 1) if row else 1
    except Exception:
        return 1
