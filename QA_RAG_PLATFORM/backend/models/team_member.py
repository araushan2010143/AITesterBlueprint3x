"""Team membership junction — one user can belong to one team with a role."""
from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import uuid


class TeamMember(SQLModel, table=True):
    __tablename__ = "team_members"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    team_id: str = Field(index=True)
    user_id: str = Field(index=True)
    role: str = Field(default="user")       # admin | user | viewer
    invited_by: Optional[str] = Field(default=None)
    joined_at: datetime = Field(default_factory=datetime.utcnow)
