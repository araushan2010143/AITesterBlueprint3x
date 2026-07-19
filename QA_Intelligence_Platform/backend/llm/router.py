"""
LLM Router — multi-provider fallback chain with muting on quota/rate errors.

Provider priority: Groq (fast) → OpenAI → Mistral → Anthropic → Cohere → Gemini

Muting:
- Quota / rate errors (429, 503, "quota", "rate") → mute for cooldown period
- Transient errors → skip this call but don't mute
- Auth errors → raise immediately (misconfiguration, not transient)
- All providers muted → RuntimeError
"""
from __future__ import annotations
import logging
import time
from dataclasses import dataclass, field

_log = logging.getLogger(__name__)

_COOLDOWN_SECS = 60


@dataclass
class LLMProvider:
    name: str
    api_key: str
    _muted_until: float = field(default=0.0, init=False, repr=False)

    def available(self) -> bool:
        return bool(self.api_key) and time.time() > self._muted_until

    def mute(self, seconds: float = _COOLDOWN_SECS) -> None:
        self._muted_until = time.time() + seconds

    def to_dict(self) -> dict:
        return {"name": self.name, "available": self.available()}


def _is_quota_or_rate(exc: Exception) -> bool:
    msg = str(exc).lower()
    code = getattr(exc, "status_code", None) or getattr(getattr(exc, "response", None), "status_code", None)
    return code in (429, 503) or any(k in msg for k in ("quota", "rate limit", "too many request"))


def _is_auth_error(exc: Exception) -> bool:
    code = getattr(exc, "status_code", None) or getattr(getattr(exc, "response", None), "status_code", None)
    return code in (401, 403)


class LLMRouter:
    def __init__(self):
        from config import get_settings
        s = get_settings()
        self._providers: list[LLMProvider] = []
        if s.groq_api_key:
            self._providers.append(LLMProvider("groq", s.groq_api_key))
        if s.openai_api_key:
            self._providers.append(LLMProvider("openai", s.openai_api_key))
        if s.mistral_api_key:
            self._providers.append(LLMProvider("mistral", s.mistral_api_key))
        if s.anthropic_api_key:
            self._providers.append(LLMProvider("anthropic", s.anthropic_api_key))
        if s.cohere_api_key:
            self._providers.append(LLMProvider("cohere", s.cohere_api_key))
        if s.gemini_api_key:
            self._providers.append(LLMProvider("gemini", s.gemini_api_key))

    def chat(self, messages: list[dict], max_tokens: int = 1024) -> str:
        available = [p for p in self._providers if p.available()]
        if not available:
            raise RuntimeError("All LLM providers are unavailable or muted")

        for provider in available:
            try:
                return self._call(provider, messages, max_tokens)
            except Exception as exc:
                _log.warning("LLM provider %s failed: %s", provider.name, exc)
                if _is_auth_error(exc):
                    raise
                if _is_quota_or_rate(exc):
                    provider.mute()
                continue

        raise RuntimeError("All LLM providers failed")

    # 30 s is well under the 45 s frontend AbortController — backend errors
    # cleanly and returns a 500 before the browser gives up.
    _TIMEOUT = 30.0

    def _call(self, provider: LLMProvider, messages: list[dict], max_tokens: int) -> str:
        if provider.name == "groq":
            from groq import Groq
            client = Groq(api_key=provider.api_key, timeout=self._TIMEOUT)
            resp = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=messages,
                max_tokens=max_tokens,
            )
            return resp.choices[0].message.content or ""

        elif provider.name == "openai":
            from openai import OpenAI
            client = OpenAI(api_key=provider.api_key, timeout=self._TIMEOUT)
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=max_tokens,
            )
            return resp.choices[0].message.content or ""

        elif provider.name == "mistral":
            from mistralai import Mistral
            client = Mistral(api_key=provider.api_key, timeout_ms=int(self._TIMEOUT * 1000))
            resp = client.chat.complete(
                model="mistral-large-latest",
                messages=messages,
                max_tokens=max_tokens,
            )
            return resp.choices[0].message.content or ""

        elif provider.name == "anthropic":
            import anthropic
            client = anthropic.Anthropic(api_key=provider.api_key, timeout=self._TIMEOUT)
            system = next((m["content"] for m in messages if m["role"] == "system"), "")
            user_msgs = [m for m in messages if m["role"] != "system"]
            resp = client.messages.create(
                model="claude-sonnet-5",
                system=system,
                messages=user_msgs,
                max_tokens=max_tokens,
            )
            return resp.content[0].text

        elif provider.name == "cohere":
            import cohere
            client = cohere.ClientV2(api_key=provider.api_key, timeout=self._TIMEOUT)
            resp = client.chat(model="command-r-plus", messages=messages, max_tokens=max_tokens)
            return resp.message.content[0].text

        elif provider.name == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=provider.api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            prompt = "\n".join(m["content"] for m in messages)
            resp = model.generate_content(
                prompt,
                request_options={"timeout": self._TIMEOUT},
            )
            return resp.text

        raise ValueError(f"Unknown provider: {provider.name}")

    def status(self) -> list[dict]:
        return [p.to_dict() for p in self._providers]
