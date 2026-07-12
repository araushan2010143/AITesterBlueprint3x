"""
Public LLM interface — delegates to the smart LLM Router.

All callers import `chat` and `rag_answer` from here; they automatically
benefit from provider fallback without any code changes.
"""
import logging
from typing import Any, Dict, List

from backend.llm.router import get_router

logger = logging.getLogger(__name__)


def chat(
    messages: List[Dict[str, str]],
    temperature: float = 0.2,
    max_tokens: int = 2048,
    json_mode: bool = False,
) -> Dict[str, Any]:
    """
    Send a chat request through the LLM Router.

    Returns:
        {answer, tokens_used, latency_ms, provider}
    """
    try:
        return get_router().chat(messages, temperature=temperature, max_tokens=max_tokens, json_mode=json_mode)
    except RuntimeError as e:
        msg = str(e)
        # Surface as a clean RuntimeError so ai_actions.py can catch and return 429/503
        if "unavailable" in msg or "exhausted" in msg or "quota" in msg.lower():
            raise RuntimeError(
                f"All LLM providers are currently unavailable or quota-exhausted. "
                f"Detail: {msg}"
            )
        raise


def rag_answer(
    question: str,
    context_chunks: List[Dict[str, Any]],
    temperature: float = 0.1,
    max_tokens: int = 1024,
) -> Dict[str, Any]:
    """Standard RAG answer from retrieved chunks."""
    context = "\n\n---\n\n".join(
        f"[Source: {c.get('metadata', {}).get('filename', 'doc')} | Score: {c.get('score', 0)}]\n{c['text']}"
        for c in context_chunks
    )
    messages = [
        {
            "role": "system",
            "content": (
                "You are a QA Knowledge Assistant. Answer questions using ONLY the provided context. "
                "Be precise and cite the source filename when relevant. "
                "If the context doesn't contain the answer, say so clearly."
            ),
        },
        {
            "role": "user",
            "content": f"Context:\n{context}\n\nQuestion: {question}",
        },
    ]
    return chat(messages, temperature=temperature, max_tokens=max_tokens)
