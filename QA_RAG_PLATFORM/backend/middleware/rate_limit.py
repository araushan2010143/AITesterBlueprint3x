"""In-process IP-based rate limiter.

No external dependency — uses a sliding-window counter per IP per bucket.
Production deployments should layer Redis-backed throttling on top.

Limits:
  • AI / migration endpoints: 20 req / 60s
  • All others: 100 req / 60s
"""
import time
import threading
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# Skipped entirely in dev when RATE_LIMIT_DISABLED=true
import os

_WINDOWS: dict = defaultdict(list)
_LOCK = threading.Lock()

# (max_calls, window_seconds)
_LIMITS = {
    "llm":     (20,  60),
    "default": (100, 60),
}

_LLM_PREFIXES = ("/api/ai", "/api/migration/jobs")


def _get_ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return (request.client.host if request.client else "unknown")


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if os.getenv("RATE_LIMIT_DISABLED", "").lower() == "true":
            return await call_next(request)

        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        bucket = "llm" if any(path.startswith(p) for p in _LLM_PREFIXES) else "default"
        max_calls, window = _LIMITS[bucket]
        ip = _get_ip(request)
        key = f"{ip}:{bucket}"
        now = time.monotonic()

        with _LOCK:
            _WINDOWS[key] = [t for t in _WINDOWS[key] if now - t < window]
            if len(_WINDOWS[key]) >= max_calls:
                remaining = window - (now - _WINDOWS[key][0])
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": f"Rate limit: {max_calls} requests / {window}s. "
                                  f"Retry in {remaining:.0f}s."
                    },
                    headers={"Retry-After": str(int(remaining))},
                )
            _WINDOWS[key].append(now)

        return await call_next(request)
