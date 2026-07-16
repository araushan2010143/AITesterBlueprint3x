"""
SAML 2.0 SSO endpoints (Service Provider side).

Flow:
  1. Admin registers IdP by POSTing metadata XML to /api/auth/saml/configure
  2. Browser hits GET /api/auth/saml/login   → 302 redirect to IdP
  3. IdP authenticates user, POSTs SAMLResponse to /api/auth/saml/callback
  4. We validate the assertion, provision/find user, return JWT

When SAML_IDP_SSO_URL is not set the endpoints return 503 with a clear message
so the frontend can gracefully hide the SSO button.

Endpoints:
  GET  /api/auth/saml/status       — is SAML configured?
  GET  /api/auth/saml/metadata     — SP metadata XML (for IdP config)
  POST /api/auth/saml/configure    — parse + preview IdP metadata XML
  GET  /api/auth/saml/login        — initiate SSO (redirect to IdP)
  POST /api/auth/saml/callback     — receive + validate SAMLResponse, return JWT
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel
from sqlmodel import Session

from backend.database.db import get_session
from backend.services import saml_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth/saml", tags=["SAML SSO"])


def _get_base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _is_https(request: Request) -> bool:
    return request.url.scheme == "https" or \
           request.headers.get("X-Forwarded-Proto", "http") == "https"


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status")
def saml_status():
    return {
        "saml_enabled": saml_service.is_enabled(),
        "library_available": saml_service._SAML_AVAILABLE,
        "idp_configured": bool(os.getenv("SAML_IDP_SSO_URL")),
        "sp_entity_id": os.getenv("SAML_SP_ENTITY_ID", ""),
        "strict_mode": os.getenv("SAML_STRICT", "true").lower() == "true",
    }


# ── SP Metadata ───────────────────────────────────────────────────────────────

@router.get("/metadata")
def sp_metadata():
    """Return SP metadata XML. Paste this URL into your IdP's SSO configuration."""
    if not saml_service._SAML_AVAILABLE:
        raise HTTPException(503, "python3-saml not installed. Run: pip install python3-saml")
    try:
        metadata = saml_service.get_sp_metadata()
        return Response(content=metadata, media_type="application/xml")
    except Exception as exc:
        raise HTTPException(500, f"Failed to generate SP metadata: {exc}") from exc


# ── Configure IdP from metadata XML ──────────────────────────────────────────

class IdPMetadataRequest(BaseModel):
    metadata_xml: str


@router.post("/configure")
def configure_idp(body: IdPMetadataRequest):
    """
    Parse an IdP's metadata XML and return the env vars the admin should set.
    Does NOT auto-apply them (requires restart / re-deploy with new env vars).
    """
    try:
        extracted = saml_service.parse_idp_metadata(body.metadata_xml)
        return {
            "status": "ok",
            "parsed": extracted,
            "instructions": (
                "Add these env vars to your .env file or deployment config, "
                "then restart the server to activate SAML SSO."
            ),
        }
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


# ── Initiate SSO ──────────────────────────────────────────────────────────────

@router.get("/login")
def saml_login(
    request: Request,
    return_to: str = "/",
):
    """
    Start SP-initiated SSO. Returns a redirect to the IdP login page.
    The browser follows the redirect; after authentication it comes back
    to /api/auth/saml/callback.
    """
    if not saml_service.is_enabled():
        raise HTTPException(503, "SAML SSO is not configured. Set SAML_IDP_SSO_URL and restart.")
    try:
        login_url = saml_service.get_login_url(
            return_to=return_to,
            base_url=_get_base_url(request),
            https=_is_https(request),
        )
        return RedirectResponse(url=login_url, status_code=302)
    except Exception as exc:
        logger.exception("SAML login initiation failed")
        raise HTTPException(500, f"SAML login failed: {exc}") from exc


# ── Assertion Consumer Service (ACS) ─────────────────────────────────────────

@router.post("/callback")
async def saml_callback(
    request: Request,
    db: Session = Depends(get_session),
):
    """
    ACS endpoint — receives the IdP's SAMLResponse POST.
    Validates the assertion, provisions the user, returns a JWT.
    """
    if not saml_service.is_enabled():
        raise HTTPException(503, "SAML SSO is not configured")

    form = await request.form()
    saml_response = form.get("SAMLResponse", "")
    relay_state   = form.get("RelayState", "/")

    if not saml_response:
        raise HTTPException(400, "SAMLResponse missing from POST body")

    try:
        saml_user = saml_service.process_response(
            saml_response_b64=str(saml_response),
            relay_state=str(relay_state),
            base_url=_get_base_url(request),
            https=_is_https(request),
        )
    except RuntimeError as exc:
        logger.warning("SAML assertion validation failed: %s", exc)
        raise HTTPException(401, f"SAML validation failed: {exc}") from exc

    # Provision / update user
    try:
        user = saml_service.provision_user(db, saml_user)
    except Exception as exc:
        logger.exception("User provisioning failed for SAML user %s", saml_user.email)
        raise HTTPException(500, "User provisioning failed") from exc

    # Issue JWT (reuse existing auth logic)
    try:
        from backend.api.routes.auth import _create_token
        token = _create_token(user.id, user.email, user.role)
    except Exception:
        # Fallback to direct JWT generation if helper not importable
        from datetime import datetime, timedelta
        import jwt as pyjwt
        settings_obj = __import__("backend.config", fromlist=["get_settings"]).get_settings()
        payload = {
            "sub": user.id,
            "email": user.email,
            "role": user.role,
            "exp": datetime.utcnow() + timedelta(hours=24),
        }
        token = pyjwt.encode(payload, settings_obj.api_key or "secret", algorithm="HS256")

    return {
        "access_token": token,
        "token_type":   "bearer",
        "user": {
            "id":           user.id,
            "email":        user.email,
            "full_name":    user.full_name,
            "role":         user.role,
            "sso_provider": "saml",
            "saml_groups":  saml_user.groups,
        },
        "redirect_to": str(relay_state) if str(relay_state).startswith("/") else "/",
    }


# ── SLO (Single Logout) — stub for Sprint 4 ──────────────────────────────────

@router.get("/logout")
def saml_logout(request: Request):
    """SAML Single Logout initiation. Full SLO implementation in Sprint 4."""
    return {
        "message": "Single Logout (SLO) will be implemented in Sprint 4. "
                   "For now, clients should delete their JWT locally."
    }
