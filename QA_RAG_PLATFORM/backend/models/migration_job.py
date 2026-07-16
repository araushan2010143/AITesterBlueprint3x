"""Persistent job record for V2 multi-file migration pipeline."""
from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import uuid


class MigrationJob(SQLModel, table=True):
    __tablename__ = "migration_jobs"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    status: str = Field(default="pending")   # pending | running | done | partial | failed
    source_type: str = Field(default="zip")  # zip | github
    source_name: str = Field(default="")
    file_count: int = Field(default=0)
    completed_files: int = Field(default=0)
    failed_files: int = Field(default=0)
    results_json: Optional[str] = Field(default=None)   # JSON list of per-file results
    versions_json: Optional[str] = Field(default=None)  # JSON list of {version, created_at, results_json}
    report_html: Optional[str] = Field(default=None)
    error: Optional[str] = Field(default=None)
    # Team scoping — jobs belong to a workspace
    team_id: Optional[str] = Field(default=None, index=True)
    created_by: Optional[str] = Field(default=None)     # user_id
    # Notifications
    webhook_url: Optional[str] = Field(default=None)
    notify_email: Optional[str] = Field(default=None)
