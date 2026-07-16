"""Versioned agent prompts — stored in DB; active version served to agents at runtime."""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Text, Column
from sqlmodel import SQLModel, Field


class PromptVersion(SQLModel, table=True):
    __tablename__ = "prompt_version"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)

    # Logical name — identifies which prompt this is (e.g. "requirement_agent_system")
    name: str = Field(index=True)
    version: int = Field(default=1)
    content: str = Field(sa_column=Column(Text))
    description: Optional[str] = None
    is_active: bool = Field(default=False)

    # team_id=None → global (applies to all teams unless team-specific version exists)
    team_id: Optional[str] = Field(default=None, index=True)
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
