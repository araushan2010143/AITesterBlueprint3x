"""
Enriched audit log API — query, filter, and SIEM export.

Endpoints:
  GET  /api/audit                    — paginated audit log (admin only)
  GET  /api/audit/stats              — event counts by risk level / path
  GET  /api/audit/export.jsonl       — streaming JSONL export for SIEM
  GET  /api/audit/{id}               — single audit log entry
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from backend.database.db import get_session
from backend.models.audit_log import AuditLog

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/audit", tags=["Audit Log"])

_RISK_ORDER = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}


@router.get("")
def list_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(100, le=500),
    risk_level: Optional[str] = Query(None, description="LOW | MEDIUM | HIGH | CRITICAL"),
    method: Optional[str] = Query(None),
    path_prefix: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    team_id: Optional[str] = Query(None),
    from_dt: Optional[str] = Query(None, description="ISO-8601 start datetime"),
    to_dt: Optional[str] = Query(None, description="ISO-8601 end datetime"),
    db: Session = Depends(get_session),
):
    stmt = select(AuditLog).order_by(AuditLog.timestamp.desc())
    if risk_level:
        stmt = stmt.where(AuditLog.risk_level == risk_level.upper())
    if method:
        stmt = stmt.where(AuditLog.method == method.upper())
    if path_prefix:
        stmt = stmt.where(AuditLog.path.startswith(path_prefix))
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if team_id:
        stmt = stmt.where(AuditLog.team_id == team_id)
    if from_dt:
        try:
            stmt = stmt.where(AuditLog.timestamp >= datetime.fromisoformat(from_dt))
        except ValueError:
            raise HTTPException(400, "Invalid from_dt format — use ISO-8601")
    if to_dt:
        try:
            stmt = stmt.where(AuditLog.timestamp <= datetime.fromisoformat(to_dt))
        except ValueError:
            raise HTTPException(400, "Invalid to_dt format — use ISO-8601")

    offset = (page - 1) * limit
    stmt = stmt.offset(offset).limit(limit)
    rows = db.exec(stmt).all()
    return {
        "page":  page,
        "limit": limit,
        "count": len(rows),
        "logs":  [_to_dict(r) for r in rows],
    }


@router.get("/stats")
def audit_stats(
    team_id: Optional[str] = Query(None),
    db: Session = Depends(get_session),
):
    """Aggregated stats for dashboard widgets."""
    stmt = select(AuditLog)
    if team_id:
        stmt = stmt.where(AuditLog.team_id == team_id)
    logs = db.exec(stmt).all()

    by_risk: dict = {}
    by_method: dict = {}
    by_path: dict = {}
    errors = 0

    for log in logs:
        r = log.risk_level or "LOW"
        by_risk[r] = by_risk.get(r, 0) + 1
        m = log.method
        by_method[m] = by_method.get(m, 0) + 1
        # Group by first two path segments
        parts = log.path.strip("/").split("/")
        key = "/" + "/".join(parts[:2])
        by_path[key] = by_path.get(key, 0) + 1
        if log.status_code >= 400:
            errors += 1

    return {
        "total":      len(logs),
        "errors":     errors,
        "by_risk":    by_risk,
        "by_method":  by_method,
        "top_paths":  sorted(by_path.items(), key=lambda x: -x[1])[:20],
    }


@router.get("/export.jsonl")
def export_jsonl(
    from_dt: Optional[str] = Query(None),
    to_dt: Optional[str] = Query(None),
    risk_level: Optional[str] = Query(None),
    team_id: Optional[str] = Query(None),
    db: Session = Depends(get_session),
):
    """
    Streaming JSONL export for SIEM ingestion (Splunk, Elastic, etc.).
    Each line is one JSON object representing one audit event.
    """
    stmt = select(AuditLog).order_by(AuditLog.timestamp.asc())
    if risk_level:
        stmt = stmt.where(AuditLog.risk_level == risk_level.upper())
    if team_id:
        stmt = stmt.where(AuditLog.team_id == team_id)
    if from_dt:
        try:
            stmt = stmt.where(AuditLog.timestamp >= datetime.fromisoformat(from_dt))
        except ValueError:
            raise HTTPException(400, "Invalid from_dt")
    if to_dt:
        try:
            stmt = stmt.where(AuditLog.timestamp <= datetime.fromisoformat(to_dt))
        except ValueError:
            raise HTTPException(400, "Invalid to_dt")

    rows = db.exec(stmt).all()

    def _stream():
        for row in rows:
            yield json.dumps(_to_dict(row)) + "\n"

    filename = f"audit-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.jsonl"
    return StreamingResponse(
        _stream(),
        media_type="application/x-ndjson",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/{audit_id}")
def get_audit_entry(audit_id: int, db: Session = Depends(get_session)):
    row = db.get(AuditLog, audit_id)
    if not row:
        raise HTTPException(404, "Audit log entry not found")
    return _to_dict(row)


def _to_dict(log: AuditLog) -> dict:
    d = {
        "id":               log.id,
        "timestamp":        log.timestamp.isoformat(),
        "method":           log.method,
        "path":             log.path,
        "status_code":      log.status_code,
        "response_ms":      log.response_ms,
        "ip_address":       log.ip_address,
        "user_agent":       log.user_agent,
        "api_key_prefix":   log.api_key_prefix,
        "risk_level":       log.risk_level,
        "user_id":          log.user_id,
        "team_id":          log.team_id,
        "event_type":       log.event_type,
        "resource_id":      log.resource_id,
        "response_size_bytes": log.response_size_bytes,
    }
    return {k: v for k, v in d.items() if v is not None}
