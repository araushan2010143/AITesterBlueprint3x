"""API key authentication middleware.

Set API_KEY env variable to enable. If unset, auth is bypassed (dev mode).
Public paths (/, /health, /api/docs, /api/redoc, /openapi.json) always pass through.
"""
import hashlib
import os
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

_PUBLIC_PATHS = frozenset({"/", "/health", "/api/docs", "/api/redoc", "/openapi.json"})
_PUBLIC_PREFIXES = ("/api/docs", "/api/redoc", "/openapi.json", "/api/llm/status", "/api/debug")


class APIKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        api_key = os.getenv("API_KEY", "").strip()

        # Dev mode — no key configured
        if not api_key:
            return await call_next(request)

        path = request.url.path

        # Always allow public paths
        if path in _PUBLIC_PATHS or any(path.startswith(p) for p in _PUBLIC_PREFIXES):
            return await call_next(request)

        # OPTIONS preflight must pass (CORS)
        if request.method == "OPTIONS":
            return await call_next(request)

        provided = request.headers.get("X-API-Key", "").strip()
        if not provided or provided != api_key:
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid API key. Set X-API-Key header."},
                headers={"WWW-Authenticate": "ApiKey"},
            )

        return await call_next(request)
