"""
Full audit trail middleware — writes every API request to the audit_logs table.

Sprint 4 enrichment:
  - risk_level classification (LOW/MEDIUM/HIGH/CRITICAL)
  - JWT user_id + team_id extraction
  - request body SHA-256 hash (for write ops, privacy-safe)
  - response size tracking
  - event_type derivation from method + path
"""
import hashlib
import logging
import time
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from sqlmodel import Session

from backend.database.db import engine
from backend.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

_SKIP = {"/health", "/", "/favicon.ico"}
_SKIP_PREFIXES = ("/api/docs", "/api/redoc", "/openapi.json", "/openapi")


def _classify_risk(method: str, path: str, status_code: int) -> str:
    if status_code in (401, 403):
        return "CRITICAL"
    if status_code >= 500:
        return "HIGH"
    m = method.upper()
    if m == "DELETE":
        return "HIGH"
    if m in ("POST", "PUT", "PATCH"):
        # Escalate specific sensitive paths
        if any(k in path for k in ("/admin", "/user", "/auth", "/saml", "/oauth")):
            return "HIGH"
        return "MEDIUM"
    return "LOW"


def _derive_event_type(method: str, path: str) -> Optional[str]:
    m = method.upper()
    seg = [s for s in path.strip("/").split("/") if s]
    if len(seg) < 2:
        return None
    resource = seg[1] if len(seg) > 1 else seg[0]  # e.g. "search", "ingest", "connectors"
    if m == "DELETE":
        return f"{resource}.deleted"
    if m == "POST":
        if "sync" in path:
            return f"{resource}.sync"
        if "ask" in path:
            return "search.ask"
        return f"{resource}.created"
    if m in ("PUT", "PATCH"):
        return f"{resource}.updated"
    return None


def _extract_jwt_claims(auth_header: str) -> dict:
    try:
        if not auth_header.startswith("Bearer "):
            return {}
        token = auth_header[7:]
        import jwt as pyjwt
        payload = pyjwt.decode(token, options={"verify_signature": False})
        return {
            "user_id": payload.get("sub", ""),
            "team_id": payload.get("team_id"),
        }
    except Exception:
        return {}


class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in _SKIP or any(path.startswith(p) for p in _SKIP_PREFIXES):
            return await call_next(request)

        # Read body hash for write operations (non-blocking)
        body_hash = None
        if request.method.upper() in ("POST", "PUT", "PATCH", "DELETE"):
            try:
                body_bytes = await request.body()
                if body_bytes:
                    body_hash = hashlib.sha256(body_bytes).hexdigest()
            except Exception:
                pass

        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000

        ip = (
            request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or request.headers.get("X-Real-IP", "")
            or (request.client.host if request.client else "")
        )

        api_key_raw = request.headers.get("X-API-Key", "")
        api_key_prefix = api_key_raw[:6] + "***" if len(api_key_raw) > 6 else ("***" if api_key_raw else "")

        jwt_claims = _extract_jwt_claims(request.headers.get("Authorization", ""))

        risk = _classify_risk(request.method, path, response.status_code)
        event_type = _derive_event_type(request.method, path)

        # Estimate response size from Content-Length header
        resp_size = 0
        try:
            cl = response.headers.get("content-length")
            resp_size = int(cl) if cl else 0
        except Exception:
            pass

        try:
            with Session(engine) as db:
                db.add(AuditLog(
                    method=request.method,
                    path=path,
                    ip_address=ip,
                    api_key_prefix=api_key_prefix,
                    status_code=response.status_code,
                    response_ms=round(elapsed_ms, 2),
                    user_agent=request.headers.get("User-Agent", "")[:200],
                    risk_level=risk,
                    user_id=jwt_claims.get("user_id") or None,
                    team_id=jwt_claims.get("team_id") or None,
                    event_type=event_type,
                    request_body_hash=body_hash,
                    response_size_bytes=resp_size,
                ))
                db.commit()
        except Exception as exc:
            logger.debug("Audit log write failed: %s", exc)

        return response
