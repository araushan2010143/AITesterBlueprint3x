"""
Immutable audit log — records every API request for compliance/governance/SIEM.

Risk levels:
  LOW      — read-only GET requests (search, list, stats)
  MEDIUM   — write operations (POST create, PUT update, connector sync)
  HIGH     — delete operations, admin user changes
  CRITICAL — auth failures, PII/secret scan blocks, permission denials (403/401)
"""
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    method: str
    path: str
    ip_address: str = ""
    api_key_prefix: str = ""   # first 6 chars + *** (never the full key)
    status_code: int = 0
    response_ms: float = 0.0
    user_agent: str = ""

    # ── Sprint 4: enriched fields ─────────────────────────────────────────────
    risk_level: str = Field(default="LOW")      # LOW | MEDIUM | HIGH | CRITICAL
    user_id: Optional[str] = Field(default=None, index=True)
    team_id: Optional[str] = Field(default=None, index=True)
    event_type: Optional[str] = Field(default=None)       # e.g. "document.delete"
    resource_id: Optional[str] = Field(default=None)      # ID of the resource accessed
    request_body_hash: Optional[str] = Field(default=None)  # SHA-256 (privacy-safe)
    response_size_bytes: int = Field(default=0)
