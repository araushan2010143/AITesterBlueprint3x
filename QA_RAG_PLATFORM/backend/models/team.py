"""Team / workspace model — multi-tenancy root object."""
from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import uuid


class Team(SQLModel, table=True):
    __tablename__ = "teams"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str = Field(index=True)
    slug: str = Field(unique=True, index=True)   # URL-safe name, e.g. "acme-corp"
    description: str = Field(default="")
    plan: str = Field(default="free")            # free | pro | enterprise
    owner_id: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
