"""
SAML 2.0 Service Provider (SP) implementation.

Supports SP-initiated SSO with HTTP-Redirect binding for AuthnRequest
and HTTP-POST binding for SAMLResponse assertion consumption.

Compatible with: Okta, Azure AD, Google Workspace, PingFederate, Keycloak,
                 and any SAML 2.0 compliant IdP.

Dependency: python3-saml (onelogin-python3-saml)
  pip install python3-saml
  apt install libxml2-dev libxmlsec1-dev  # required C libs

When the library is absent the service silently disables — all callers
must check `saml_service.is_enabled()` before using.

Config (env vars):
  SAML_SP_ENTITY_ID    — e.g. https://myapp.com/api/auth/saml/metadata
  SAML_SP_CALLBACK_URL — e.g. https://myapp.com/api/auth/saml/callback
  SAML_IDP_ENTITY_ID   — from IdP metadata
  SAML_IDP_SSO_URL     — from IdP metadata
  SAML_IDP_CERT        — base64-encoded IdP X.509 cert (single line, no -----BEGIN...--)
  SAML_SP_CERT         — (optional) base64-encoded SP cert for signed requests
  SAML_SP_KEY          — (optional) base64-encoded SP private key
  SAML_STRICT          — "true" (default) | "false" — whether to enforce SAML security checks
  SAML_DEBUG           — "false" | "true"
"""
from __future__ import annotations

import base64
import logging
import os
import zlib
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib.parse import quote, urlencode, urlparse

logger = logging.getLogger(__name__)

_SAML_AVAILABLE = False
try:
    from onelogin.saml2.auth import OneLogin_Saml2_Auth
    from onelogin.saml2.utils import OneLogin_Saml2_Utils
    from onelogin.saml2.settings import OneLogin_Saml2_Settings
    _SAML_AVAILABLE = True
    logger.info("python3-saml loaded — SAML 2.0 SSO available")
except ImportError:
    logger.info("python3-saml not installed — SAML SSO disabled. "
                "Install with: pip install python3-saml")


@dataclass
class SAMLUser:
    email: str
    display_name: str
    given_name: str
    surname: str
    groups: List[str]
    name_id: str
    session_index: str
    raw_attributes: Dict[str, Any]


def is_enabled() -> bool:
    return _SAML_AVAILABLE and bool(os.getenv("SAML_IDP_SSO_URL"))


def _build_settings() -> Dict[str, Any]:
    """Construct python3-saml settings dict from environment variables."""
    sp_entity_id    = os.getenv("SAML_SP_ENTITY_ID", "")
    sp_callback_url = os.getenv("SAML_SP_CALLBACK_URL", "")
    sp_cert         = os.getenv("SAML_SP_CERT", "")
    sp_key          = os.getenv("SAML_SP_KEY", "")
    idp_entity_id   = os.getenv("SAML_IDP_ENTITY_ID", "")
    idp_sso_url     = os.getenv("SAML_IDP_SSO_URL", "")
    idp_slo_url     = os.getenv("SAML_IDP_SLO_URL", "")
    idp_cert        = os.getenv("SAML_IDP_CERT", "")
    strict          = os.getenv("SAML_STRICT", "true").lower() == "true"
    debug           = os.getenv("SAML_DEBUG", "false").lower() == "true"

    settings: Dict[str, Any] = {
        "strict": strict,
        "debug":  debug,
        "sp": {
            "entityId": sp_entity_id,
            "assertionConsumerService": {
                "url":     sp_callback_url,
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
            },
            "singleLogoutService": {
                "url":     sp_callback_url.replace("/callback", "/logout"),
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
            },
            "NameIDFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
            "x509cert": sp_cert,
            "privateKey": sp_key,
        },
        "idp": {
            "entityId": idp_entity_id,
            "singleSignOnService": {
                "url":     idp_sso_url,
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
            },
            "singleLogoutService": {
                "url":     idp_slo_url or idp_sso_url,
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
            },
            "x509cert": idp_cert,
        },
        "security": {
            "nameIdEncrypted":         False,
            "authnRequestsSigned":     bool(sp_key),
            "logoutRequestSigned":     bool(sp_key),
            "logoutResponseSigned":    bool(sp_key),
            "signMetadata":            bool(sp_key),
            "wantMessagesSigned":      False,
            "wantAssertionsSigned":    strict,
            "wantNameId":              True,
            "wantNameIdEncrypted":     False,
            "wantAssertionsEncrypted": False,
            "signatureAlgorithm":      "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
            "digestAlgorithm":         "http://www.w3.org/2001/04/xmlenc#sha256",
        },
    }
    return settings


def _make_auth(request_data: Dict[str, Any]) -> "OneLogin_Saml2_Auth":
    """Build a OneLogin auth object from the current request data."""
    return OneLogin_Saml2_Auth(request_data, old_settings=_build_settings())


def _request_data_from(
    http_method: str,
    query_string: str,
    post_data: Dict[str, str],
    base_url: str,
    https: bool = True,
) -> Dict[str, Any]:
    """
    Construct the request_data dict that python3-saml expects.
    In production this comes from the actual HTTP request.
    """
    parsed = urlparse(base_url)
    return {
        "https":            "on" if https else "off",
        "http_host":        parsed.netloc,
        "server_port":      parsed.port or (443 if https else 80),
        "script_name":      parsed.path,
        "get_data":         dict(p.split("=", 1) for p in query_string.split("&") if "=" in p),
        "post_data":        post_data,
        "query_string":     query_string,
    }


# ── Public API ────────────────────────────────────────────────────────────────

def get_sp_metadata() -> str:
    """Return SP metadata XML (paste into IdP configuration)."""
    if not _SAML_AVAILABLE:
        return "<error>python3-saml not installed</error>"
    settings_obj = OneLogin_Saml2_Settings(_build_settings(), sp_validation_only=True)
    metadata = settings_obj.get_sp_metadata()
    return metadata


def get_login_url(
    return_to: str = "",
    base_url: str = "",
    https: bool = True,
) -> str:
    """
    Generate the redirect URL to send the browser to the IdP for login.
    relay_state = return_to (URL to redirect after successful auth).
    """
    if not _SAML_AVAILABLE:
        raise RuntimeError("SAML is not configured")
    req_data = _request_data_from("GET", "", {}, base_url or os.getenv("SAML_SP_CALLBACK_URL", ""), https)
    auth = _make_auth(req_data)
    return auth.login(return_to=return_to)


def process_response(
    saml_response_b64: str,
    relay_state: str = "",
    base_url: str = "",
    https: bool = True,
) -> SAMLUser:
    """
    Validate the SAMLResponse and extract user attributes.
    Raises RuntimeError on any validation failure (bad signature, expired, etc.)
    """
    if not _SAML_AVAILABLE:
        raise RuntimeError("SAML is not configured")
    req_data = _request_data_from(
        "POST", "", {"SAMLResponse": saml_response_b64, "RelayState": relay_state},
        base_url or os.getenv("SAML_SP_CALLBACK_URL", ""), https,
    )
    auth = _make_auth(req_data)
    auth.process_response()

    errors = auth.get_errors()
    if errors:
        reason = auth.get_last_error_reason() or str(errors)
        raise RuntimeError(f"SAML validation failed: {reason}")

    if not auth.is_authenticated():
        raise RuntimeError("SAML authentication was not successful")

    attrs = auth.get_attributes()
    name_id = auth.get_nameid() or ""

    def _attr(keys: List[str]) -> str:
        for k in keys:
            v = attrs.get(k)
            if v:
                return v[0] if isinstance(v, list) else v
        return ""

    email = name_id if "@" in name_id else _attr([
        "email", "mail", "emailAddress",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
        "urn:oid:0.9.2342.19200300.100.1.3",
    ])
    display_name = _attr([
        "displayName", "cn", "name",
        "http://schemas.microsoft.com/identity/claims/displayname",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
    ])
    given_name = _attr([
        "givenName", "firstName",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
    ])
    surname = _attr([
        "sn", "surname", "lastName",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
    ])
    groups_raw = attrs.get("groups") or attrs.get("memberOf") or attrs.get(
        "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups", []
    )
    groups = groups_raw if isinstance(groups_raw, list) else [groups_raw]

    return SAMLUser(
        email=email,
        display_name=display_name or f"{given_name} {surname}".strip() or email,
        given_name=given_name,
        surname=surname,
        groups=[g for g in groups if g],
        name_id=name_id,
        session_index=auth.get_session_index() or "",
        raw_attributes=attrs,
    )


def provision_user(db_session: Any, saml_user: SAMLUser) -> Any:
    """
    Find or create a User record from SAML attributes.
    Assigns 'admin' role to the first provisioned user (same logic as OAuth).
    Returns the User ORM object.
    """
    from sqlmodel import select
    from backend.models.user import User
    import uuid

    existing = db_session.exec(select(User).where(User.email == saml_user.email)).first()
    if existing:
        existing.full_name = saml_user.display_name
        db_session.add(existing)
        db_session.commit()
        return existing

    is_first = db_session.exec(select(User)).first() is None
    user = User(
        id=str(uuid.uuid4()),
        email=saml_user.email,
        full_name=saml_user.display_name,
        hashed_password=str(uuid.uuid4()),   # unusable — SAML-only login
        role="admin" if is_first else "user",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def parse_idp_metadata(metadata_xml: str) -> Dict[str, str]:
    """
    Extract IdP settings from a standard IdP metadata XML string.
    Returns a dict of env var names → values the admin should set.
    """
    try:
        import lxml.etree as ET
        ns = {
            "md":  "urn:oasis:names:tc:SAML:2.0:metadata",
            "ds":  "http://www.w3.org/2000/09/xmldsig#",
        }
        root = ET.fromstring(metadata_xml.encode())
        entity_id = root.get("entityID", "")
        sso_urls = root.findall(".//md:SingleSignOnService", ns)
        sso_url = ""
        for svc in sso_urls:
            if "HTTP-Redirect" in svc.get("Binding", ""):
                sso_url = svc.get("Location", "")
                break
        cert_elem = root.find(".//ds:X509Certificate", ns)
        cert = cert_elem.text.strip().replace("\n", "").replace(" ", "") if cert_elem is not None else ""
        return {
            "SAML_IDP_ENTITY_ID": entity_id,
            "SAML_IDP_SSO_URL":   sso_url,
            "SAML_IDP_CERT":      cert,
        }
    except Exception as exc:
        raise ValueError(f"Failed to parse IdP metadata: {exc}") from exc
