"""AgentReview — human approval/rejection of an AI agent recommendation."""
import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field
from sqlalchemy import Text, Column


class AgentReview(SQLModel, table=True):
    __tablename__ = "agent_reviews"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    # Link to the agent run being reviewed
    run_id: str = Field(index=True)
    agent_name: str = Field(default="")
    task_type: str = Field(default="")
    # Review decision
    verdict: str = Field(index=True)  # accept | modify | reject
    # Free-text reviewer feedback (correction or reason for rejection)
    feedback: Optional[str] = Field(default=None, sa_column=Column(Text))
    # If verdict=modify: the corrected output as a JSON string
    corrected_output: Optional[str] = Field(default=None, sa_column=Column(Text))
    # Scoping
    team_id: Optional[str] = Field(default=None, index=True)
    reviewed_by: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
