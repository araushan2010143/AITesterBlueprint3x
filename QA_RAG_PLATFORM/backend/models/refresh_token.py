"""Refresh token store — enables JWT rotation and multi-device session management."""
import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class RefreshToken(SQLModel, table=True):
    __tablename__ = "refresh_token"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)

    # SHA-256 hash of the raw token — the raw token is only sent to the client once
    token_hash: str = Field(index=True)
    user_id: str = Field(index=True)
    team_id: Optional[str] = None

    # Lifecycle
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    used_at: Optional[datetime] = None      # set on rotation (token consumed)
    revoked_at: Optional[datetime] = None   # set on explicit logout / revocation

    # Optional device hint for the sessions list UI
    device_hint: Optional[str] = None       # e.g. "Chrome / macOS", "iOS App"
    ip_address: Optional[str] = None

    @property
    def is_valid(self) -> bool:
        return (
            self.used_at is None
            and self.revoked_at is None
            and self.expires_at > datetime.utcnow()
        )
