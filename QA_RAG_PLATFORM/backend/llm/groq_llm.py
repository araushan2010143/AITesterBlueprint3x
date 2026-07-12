"""Groq LLM calls — JSON mode + streaming."""
import json
import time
from typing import List, Dict, Any, Optional
from groq import Groq
from backend.config import get_settings

settings = get_settings()
_client: Optional[Groq] = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        _client = Groq(api_key=settings.groq_api_key)
    return _client


def chat(
    messages: List[Dict[str, str]],
    temperature: float = 0.2,
    max_tokens: int = 2048,
    json_mode: bool = False,
) -> Dict[str, Any]:
    """Returns {answer, tokens_used, latency_ms}."""
    client = _get_client()
    kwargs: Dict[str, Any] = dict(
        model=settings.groq_model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    t0 = time.perf_counter()
    response = client.chat.completions.create(**kwargs)
    latency_ms = round((time.perf_counter() - t0) * 1000, 1)

    content = response.choices[0].message.content
    usage = response.usage

    return {
        "answer": content,
        "tokens_used": usage.total_tokens if usage else 0,
        "latency_ms": latency_ms,
    }


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
