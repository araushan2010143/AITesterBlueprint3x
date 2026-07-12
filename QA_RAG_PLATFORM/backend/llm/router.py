"""
Smart LLM Router — tries providers in priority order, auto-falls back when
quota / rate-limit is hit. Each exhausted provider is muted for `cooldown`
seconds so subsequent requests skip straight to the next available one.

Usage:
    from backend.llm.router import get_router
    result = get_router().chat(messages, temperature=0.2, max_tokens=2048, json_mode=True)
    # result["provider"] tells you which provider handled it
"""
import time
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

# Keywords / status codes that mean "try another provider"
_QUOTA_KEYWORDS = (
    "rate limit", "rate_limit", "quota", "tokens per day", "tpd",
    "resource_exhausted", "too many requests", "exceeded",
    "insufficient_quota", "overloaded", "capacity", "billing",
    "context length exceeded", "model_not_found",
)


def _is_quota_or_rate(exc: Exception) -> bool:
    """Return True when the error means the provider is temporarily unavailable."""
    msg = str(exc).lower()
    # Direct status code check
    code = getattr(exc, "status_code", None)
    if code in (429, 503):
        return True
    # Nested response object (e.g. httpx)
    resp = getattr(exc, "response", None)
    if resp is not None and getattr(resp, "status_code", None) in (429, 503):
        return True
    return any(k in msg for k in _QUOTA_KEYWORDS)


@dataclass
class LLMProvider:
    name: str
    fn: Callable[..., Dict[str, Any]]  # (messages, temp, max_tokens, json_mode) → result
    cooldown: int = 3600               # seconds to mute after quota hit (default 1h)
    _muted_until: float = field(default=0.0, repr=False)

    def available(self) -> bool:
        return time.time() >= self._muted_until

    def mute(self) -> None:
        self._muted_until = time.time() + self.cooldown
        logger.warning(
            "🔇 LLM provider '%s' muted for %ds (quota/rate-limit). "
            "Router will skip it until %.0f.",
            self.name, self.cooldown, self._muted_until,
        )

    def resets_in(self) -> float:
        return max(0.0, self._muted_until - time.time())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "available": self.available(),
            "resets_in_s": round(self.resets_in()),
        }


class LLMRouter:
    """
    Round-robin fallback router.

    On each `chat()` call it walks the provider list in order:
      - Skips muted (recently-exhausted) providers
      - On quota/rate-limit error → mutes the provider and tries the next
      - On any other error → propagates immediately (auth, bad request, etc.)
      - If all providers are muted → raises RuntimeError with full status
    """

    def __init__(self, providers: List[LLMProvider]) -> None:
        self._providers = providers

    # ── Public API ────────────────────────────────────────────────────────────

    def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 2048,
        json_mode: bool = False,
    ) -> Dict[str, Any]:
        last_exc: Optional[Exception] = None

        for p in self._providers:
            if not p.available():
                logger.debug("⏭  Skipping '%s' (muted, resets in %ds)", p.name, p.resets_in())
                continue

            try:
                logger.debug("▶  Trying LLM provider '%s'", p.name)
                result = p.fn(messages, temperature, max_tokens, json_mode)
                result.setdefault("provider", p.name)
                if p.name != self._providers[0].name:
                    logger.info("✅ Fallback provider '%s' served the request", p.name)
                return result

            except Exception as exc:
                if _is_quota_or_rate(exc):
                    p.mute()
                    last_exc = exc
                    continue          # try next provider
                raise                 # auth/validation errors propagate immediately

        statuses = {p.name: "available" if p.available() else f"muted {p.resets_in():.0f}s" for p in self._providers}
        raise RuntimeError(
            f"All LLM providers unavailable: {statuses}. "
            f"Add more provider API keys or wait for quota reset. "
            f"Last error: {last_exc}"
        )

    def status(self) -> List[Dict[str, Any]]:
        return [p.to_dict() for p in self._providers]

    def available_count(self) -> int:
        return sum(1 for p in self._providers if p.available())


# ── Singleton ──────────────────────────────────────────────────────────────────
# Built once on first access so muting state persists across all requests
# within a single server process.

_router: Optional[LLMRouter] = None


def get_router() -> LLMRouter:
    global _router
    if _router is None:
        _router = _build_router()
    return _router


def _build_router() -> LLMRouter:
    from backend.config import get_settings
    from backend.llm.providers import (
        make_openai_compat,
        make_cohere_provider,
    )

    s = get_settings()
    providers: List[LLMProvider] = []

    # ── Groq: primary model ─────────────────────────────────────────────────
    if s.groq_api_key:
        providers.append(LLMProvider(
            name=f"Groq/{s.groq_model}",
            fn=make_openai_compat(
                api_key=s.groq_api_key,
                model=s.groq_model,
                base_url="https://api.groq.com/openai/v1",
            ),
            cooldown=3600,
        ))

    # ── Groq: lighter fallback model (independent TPD quota) ────────────────
    if s.groq_api_key and s.groq_fallback_model and s.groq_fallback_model != s.groq_model:
        providers.append(LLMProvider(
            name=f"Groq/{s.groq_fallback_model}",
            fn=make_openai_compat(
                api_key=s.groq_api_key,
                model=s.groq_fallback_model,
                base_url="https://api.groq.com/openai/v1",
            ),
            cooldown=3600,
        ))

    # ── Mistral: already have key (used for embeddings) ─────────────────────
    if s.mistral_api_key:
        providers.append(LLMProvider(
            name=f"Mistral/{s.mistral_chat_model}",
            fn=make_openai_compat(
                api_key=s.mistral_api_key,
                model=s.mistral_chat_model,
                base_url="https://api.mistral.ai/v1",
            ),
            cooldown=1800,
        ))

    # ── Cohere: already have key ─────────────────────────────────────────────
    if s.cohere_api_key:
        providers.append(LLMProvider(
            name=f"Cohere/{s.cohere_chat_model}",
            fn=make_cohere_provider(
                api_key=s.cohere_api_key,
                model=s.cohere_chat_model,
            ),
            cooldown=1800,
        ))

    # ── OpenAI (optional) ────────────────────────────────────────────────────
    if s.openai_api_key:
        providers.append(LLMProvider(
            name=f"OpenAI/{s.openai_model}",
            fn=make_openai_compat(
                api_key=s.openai_api_key,
                model=s.openai_model,
                base_url=None,
            ),
            cooldown=3600,
        ))

    # ── Gemini (optional) ────────────────────────────────────────────────────
    if s.gemini_api_key:
        providers.append(LLMProvider(
            name=f"Gemini/{s.gemini_model}",
            fn=make_openai_compat(
                api_key=s.gemini_api_key,
                model=s.gemini_model,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            ),
            cooldown=3600,
        ))

    if not providers:
        raise RuntimeError("No LLM provider API keys configured. Set at least GROQ_API_KEY in .env")

    logger.info("LLM Router initialised with %d provider(s): %s", len(providers), [p.name for p in providers])
    return LLMRouter(providers)
