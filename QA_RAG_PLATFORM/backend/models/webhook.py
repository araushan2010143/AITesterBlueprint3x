"""Outgoing webhook configuration and delivery tracking models."""
import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field
from sqlalchemy import Text, Column


class WebhookConfig(SQLModel, table=True):
    __tablename__ = "webhook_configs"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str
    url: str                                         # HTTPS endpoint to POST events to
    secret: str = Field(default="")                  # HMAC-SHA256 signing secret
    # Comma-separated event subscriptions — "*" = all events
    # Examples: "connector.sync.done,agent.run.done,document.ingested"
    events: str = Field(default="*")
    is_active: bool = Field(default=True)
    team_id: Optional[str] = Field(default=None, index=True)
    created_by: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    # Stats
    total_deliveries: int = Field(default=0)
    failed_deliveries: int = Field(default=0)
    last_triggered_at: Optional[datetime] = Field(default=None)


class WebhookDelivery(SQLModel, table=True):
    __tablename__ = "webhook_deliveries"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    webhook_id: str = Field(index=True)
    event_type: str = Field(index=True)
    status: str = Field(default="pending")          # pending | delivered | failed | skipped
    payload_json: str = Field(sa_column=Column(Text))
    response_status: int = Field(default=0)
    response_body: Optional[str] = Field(default=None)
    attempt_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    delivered_at: Optional[datetime] = Field(default=None)
