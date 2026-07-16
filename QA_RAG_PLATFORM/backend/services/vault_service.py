"""
HashiCorp Vault integration — optional secrets management.

When VAULT_ADDR is not set the service is disabled and get_secret() falls back
to environment variables transparently.

Supported auth methods:
  1. Token      — set VAULT_TOKEN
  2. Kubernetes — set VAULT_K8S_ROLE (uses /var/run/secrets/kubernetes.io/serviceaccount/token)
  3. AppRole    — set VAULT_ROLE_ID + VAULT_SECRET_ID

Vault KV v2 paths follow the convention:
  secret/data/qa-rag-platform/<component>   e.g. secret/data/qa-rag-platform/pinecone

Usage:
  from backend.services.vault_service import get_secret
  api_key = get_secret("pinecone", "api_key", default="")   # env fallback: PINECONE_API_KEY
"""
from __future__ import annotations

import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

_VAULT_MOUNT       = os.getenv("VAULT_MOUNT", "secret")
_VAULT_PATH_PREFIX = os.getenv("VAULT_PATH_PREFIX", "qa-rag-platform")

# ── Optional hvac import ──────────────────────────────────────────────────────

_HVAC_AVAILABLE = False
try:
    import hvac  # type: ignore
    _HVAC_AVAILABLE = True
except ImportError:
    pass

_client: Optional[Any] = None   # hvac.Client singleton


def is_enabled() -> bool:
    """Return True when Vault address is configured and hvac is installed."""
    return bool(os.getenv("VAULT_ADDR") and _HVAC_AVAILABLE)


def _get_client():
    """Return an authenticated hvac client, creating one if needed."""
    global _client
    if _client is not None:
        return _client

    if not is_enabled():
        return None

    try:
        c = hvac.Client(url=os.getenv("VAULT_ADDR", ""))

        # 1. Token auth (simplest)
        vault_token = os.getenv("VAULT_TOKEN", "")
        if vault_token:
            c.token = vault_token
            if c.is_authenticated():
                logger.info("Vault: authenticated via token")
                _client = c
                return _client

        # 2. Kubernetes auth
        if os.getenv("VAULT_K8S_ROLE"):
            k8s_token_path = "/var/run/secrets/kubernetes.io/serviceaccount/token"
            if os.path.exists(k8s_token_path):
                with open(k8s_token_path) as f:
                    k8s_token = f.read().strip()
                result = c.auth.kubernetes.login(role=os.getenv("VAULT_K8S_ROLE", ""), jwt=k8s_token)
                c.token = result["auth"]["client_token"]
                if c.is_authenticated():
                    logger.info("Vault: authenticated via Kubernetes")
                    _client = c
                    return _client

        # 3. AppRole auth
        vault_role_id = os.getenv("VAULT_ROLE_ID", "")
        vault_secret_id = os.getenv("VAULT_SECRET_ID", "")
        if vault_role_id and vault_secret_id:
            result = c.auth.approle.login(
                role_id=vault_role_id,
                secret_id=vault_secret_id,
            )
            c.token = result["auth"]["client_token"]
            if c.is_authenticated():
                logger.info("Vault: authenticated via AppRole")
                _client = c
                return _client

        logger.warning("Vault: no valid auth method found — falling back to env vars")
    except Exception as exc:
        logger.warning("Vault client init failed (%s) — falling back to env vars", exc)

    return None


def get_secret(component: str, key: str, default: str = "") -> str:
    """
    Fetch a secret from Vault at path:
      {_VAULT_MOUNT}/data/{_VAULT_PATH_PREFIX}/{component}

    Returns the value for `key` from the KV v2 `data` block.
    Falls back to os.getenv(key.upper(), default) when Vault is disabled or the
    key is absent in Vault.

    Example:
      get_secret("pinecone", "api_key")
      → reads VAULT_MOUNT/data/qa-rag-platform/pinecone, returns data["api_key"]
      → fallback: os.getenv("API_KEY", "")
    """
    env_fallback = os.getenv(key.upper(), default)

    client = _get_client()
    if client is None:
        return env_fallback

    try:
        path = f"{_VAULT_PATH_PREFIX}/{component}"
        secret = client.secrets.kv.v2.read_secret_version(
            path=path, mount_point=_VAULT_MOUNT, raise_on_deleted_version=False
        )
        value = secret["data"]["data"].get(key, "")
        if value:
            return value
    except Exception as exc:
        logger.debug("Vault get_secret(%s, %s) failed: %s — using env fallback", component, key, exc)

    return env_fallback


def renew_token(increment: int = 3600) -> bool:
    """Renew the current Vault token lease. Returns True on success."""
    client = _get_client()
    if client is None:
        return False
    try:
        client.auth.token.renew_self(increment=increment)
        logger.info("Vault: token renewed (+%ds)", increment)
        return True
    except Exception as exc:
        logger.warning("Vault token renewal failed: %s", exc)
        return False


def health() -> dict:
    """Return Vault connectivity status for /health endpoint."""
    if not is_enabled():
        return {"vault_enabled": False, "status": "disabled"}
    client = _get_client()
    if client is None:
        return {"vault_enabled": True, "status": "unauthenticated"}
    try:
        return {
            "vault_enabled": True,
            "status":        "authenticated" if client.is_authenticated() else "unauthenticated",
            "addr":          os.getenv("VAULT_ADDR", ""),
        }
    except Exception as exc:
        return {"vault_enabled": True, "status": f"error: {exc}"}
