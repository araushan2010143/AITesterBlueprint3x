"""
Provider factory functions for the LLM Router.

All OpenAI-compatible providers (Groq, Mistral, Gemini, OpenAI itself) share
the same factory — only `api_key`, `model`, and `base_url` differ.
Cohere gets its own factory because it uses a different SDK interface.
"""
import time
import logging
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


def make_openai_compat(
    api_key: str,
    model: str,
    base_url: Optional[str] = None,
    json_mode_supported: bool = True,
) -> Callable:
    """
    Returns a provider fn that calls any OpenAI-compatible chat endpoint.

    Providers using this factory:
      - Groq          → base_url="https://api.groq.com/openai/v1"
      - Mistral       → base_url="https://api.mistral.ai/v1"
      - Gemini        → base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
      - OpenAI native → base_url=None
    """
    from openai import OpenAI

    _TIMEOUT = 30.0
    client = (
        OpenAI(api_key=api_key, base_url=base_url, timeout=_TIMEOUT)
        if base_url
        else OpenAI(api_key=api_key, timeout=_TIMEOUT)
    )

    def call(
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        json_mode: bool,
    ) -> Dict[str, Any]:
        kwargs: Dict[str, Any] = dict(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        if json_mode:
            if json_mode_supported:
                kwargs["response_format"] = {"type": "json_object"}
            else:
                # Inject JSON instruction into the last user turn
                msgs = list(messages)
                last = msgs[-1]
                msgs[-1] = {
                    **last,
                    "content": last["content"] + "\n\nReturn ONLY valid JSON. No markdown, no explanation.",
                }
                kwargs["messages"] = msgs

        t0 = time.perf_counter()
        resp = client.chat.completions.create(**kwargs)
        return {
            "answer": resp.choices[0].message.content,
            "tokens_used": resp.usage.total_tokens if resp.usage else 0,
            "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
        }

    return call


def make_cohere_provider(api_key: str, model: str = "command-r-plus") -> Callable:
    """
    Cohere native SDK provider.

    Cohere's chat API is stateful (message + chat_history), so we adapt the
    standard messages list: the last user message becomes `message`, all prior
    turns become `chat_history`.
    """
    import cohere

    client = cohere.Client(api_key=api_key, timeout=30)

    def _to_cohere_history(messages: List[Dict[str, str]]):
        """Convert OpenAI-style messages to Cohere chat_history + message."""
        # Last message must be from user
        user_message = ""
        history = []
        for m in messages:
            role = m["role"]
            content = m["content"]
            if role == "system":
                # Prepend system prompt to the history as a preamble
                history.append({"role": "CHATBOT", "message": f"[System] {content}"})
            elif role == "user":
                user_message = content  # will be overwritten by latest
                if len(history) > 0 or messages.index(m) < len(messages) - 1:
                    history.append({"role": "USER", "message": content})
            elif role == "assistant":
                history.append({"role": "CHATBOT", "message": content})

        # The final user message becomes the `message` param
        # Remove it from history if it was added
        if history and history[-1]["role"] == "USER":
            user_message = history.pop()["message"]

        return user_message, history

    def call(
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        json_mode: bool,
    ) -> Dict[str, Any]:
        user_message, chat_history = _to_cohere_history(messages)

        if json_mode:
            user_message += "\n\nReturn ONLY valid JSON. No markdown, no explanation."

        t0 = time.perf_counter()
        resp = client.chat(
            model=model,
            message=user_message,
            chat_history=chat_history,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        text = resp.text or ""
        tokens = 0
        if hasattr(resp, "meta") and resp.meta and hasattr(resp.meta, "tokens"):
            tokens = (resp.meta.tokens.input_tokens or 0) + (resp.meta.tokens.output_tokens or 0)

        return {
            "answer": text,
            "tokens_used": tokens,
            "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
        }

    return call
