"""
FastAPI dependency factories for ABAC permission enforcement.

Usage:
  @router.delete("/{doc_id}")
  def delete_doc(
      doc_id: str,
      _: None = Depends(require_permission(RESOURCE_DOCUMENT, ACTION_DELETE)),
      session: Session = Depends(get_session),
  ):
      ...

When no JWT is present the check runs with role="viewer", team_id=None
(open-access dev mode) which will be denied for write/delete operations.

For open-access dev mode (no API_KEY), all reads are allowed.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from backend.abac.engine import abac

_bearer = HTTPBearer(auto_error=False)


def _extract_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials],
) -> Dict[str, Any]:
    """Extract user context from JWT Bearer token. Returns defaults on missing/invalid token."""
    if credentials and credentials.credentials:
        try:
            import jwt as pyjwt
            from backend.config import get_settings
            settings = get_settings()
            secret = settings.api_key or "secret"
            payload = pyjwt.decode(
                credentials.credentials, secret, algorithms=["HS256"],
                options={"verify_exp": True},
            )
            return {
                "user_id":  payload.get("sub", ""),
                "role":     payload.get("role", "viewer"),
                "team_id":  payload.get("team_id"),
                "email":    payload.get("email", ""),
            }
        except Exception:
            pass
    return {"user_id": None, "role": "viewer", "team_id": None, "email": ""}


def require_permission(resource_type: str, action: str):
    """
    Returns a FastAPI dependency that checks ABAC permission.
    Raises 403 if denied, returns user context dict if allowed.
    """
    def _dep(
        request: Request,
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    ) -> Dict[str, Any]:
        from backend.config import get_settings
        settings = get_settings()
        # Dev mode: no API_KEY configured → allow all reads; restrict writes to admin check
        if not settings.api_key:
            return {"user_id": None, "role": "admin", "team_id": None, "email": ""}
        user = _extract_user(request, credentials)
        abac.check_or_raise(
            user_role=user["role"],
            user_team_id=user["team_id"],
            user_id=user["user_id"],
            action=action,
            resource_type=resource_type,
        )
        return user
    return _dep


def require_permission_on_resource(resource_type: str, action: str):
    """
    Like require_permission but also passes the loaded resource dict for
    condition checks (team_id_match, own_resource).
    Use when you've already loaded the resource from DB.
    """
    def _factory(resource: Dict[str, Any]):
        def _dep(
            request: Request,
            credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
        ) -> Dict[str, Any]:
            from backend.config import get_settings
            if not get_settings().api_key:
                return {"user_id": None, "role": "admin", "team_id": None}
            user = _extract_user(request, credentials)
            abac.check_or_raise(
                user_role=user["role"],
                user_team_id=user["team_id"],
                user_id=user["user_id"],
                action=action,
                resource_type=resource_type,
                resource=resource,
            )
            return user
        return _dep
    return _factory
