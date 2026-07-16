"""Data source connector models — Jira, Confluence, TestRail, etc."""
import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class DataConnector(SQLModel, table=True):
    __tablename__ = "data_connectors"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str = Field(index=True)
    connector_type: str = Field(index=True)   # jira | confluence | testrail | github
    base_url: str                              # e.g. https://myorg.atlassian.net
    email: str = Field(default="")            # Atlassian email
    # NOTE: store encrypted in production (Vault / KMS).
    # For Sprint 1 we store it base64-encoded; Sprint 6 adds Vault integration.
    api_token_enc: str = Field(default="")    # base64-encoded API token
    project_keys: str = Field(default="")     # comma-separated Jira project keys
    space_keys: str = Field(default="")       # comma-separated Confluence space keys
    extra_config: str = Field(default="{}")   # JSON for connector-specific settings
    is_active: bool = Field(default=True)
    # Workspace scoping
    team_id: Optional[str] = Field(default=None, index=True)
    created_by: Optional[str] = Field(default=None)
    # Sync state
    last_sync_at: Optional[datetime] = Field(default=None)
    last_sync_status: str = Field(default="never")  # never | syncing | done | failed
    last_sync_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ConnectorRun(SQLModel, table=True):
    __tablename__ = "connector_runs"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    connector_id: str = Field(index=True)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = Field(default=None)
    status: str = Field(default="running")    # running | done | failed
    items_fetched: int = Field(default=0)
    items_ingested: int = Field(default=0)
    items_failed: int = Field(default=0)
    error: Optional[str] = Field(default=None)
    log_json: Optional[str] = Field(default=None)  # JSON array of per-item results
