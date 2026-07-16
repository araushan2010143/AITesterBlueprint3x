"""AgentRun — persists every agent execution for audit and replay."""
import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field
from sqlalchemy import Text, Column


class AgentRun(SQLModel, table=True):
    __tablename__ = "agent_runs"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    agent_name: str = Field(index=True)          # requirement | story | impact | rca
    task_type: str = Field(index=True)
    status: str = Field(default="running")        # running | done | failed
    # Input / output stored as JSON strings
    input_json: Optional[str] = Field(default=None, sa_column=Column(Text))
    output_json: Optional[str] = Field(default=None, sa_column=Column(Text))
    error: Optional[str] = Field(default=None)
    # Usage stats
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)
    # Scoping
    team_id: Optional[str] = Field(default=None, index=True)
    created_by: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = Field(default=None)
