"""SQLModel for company coding standards uploaded by users."""
from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import uuid


class MigrationStandard(SQLModel, table=True):
    __tablename__ = "migration_standards"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str = Field(default="")               # e.g. "TypeScript Style Guide"
    filename: str = Field(default="")
    content: str = Field(default="")            # full text of the standard
    chunks_json: Optional[str] = Field(default=None)  # JSON list of paragraph chunks (for BM25)
    created_at: datetime = Field(default_factory=datetime.utcnow)
