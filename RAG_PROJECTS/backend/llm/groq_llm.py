"""Groq LLM — supports both regular and streaming answer generation."""
import os
import time
from typing import List, Dict, Any, Generator

from groq import Groq

SYSTEM_PROMPT = (
    "You are a precise document question-answering assistant.\n"
    "Answer questions ONLY using the provided context below.\n"
    "If the context does not contain sufficient information to answer, "
    "respond with: \"The information is not available in the provided document.\"\n"
    "Never hallucinate. Cite page numbers using [Page N] when referencing sources.\n"
    "Be concise, accurate, and structured."
)


def build_context(chunks: List[Dict[str, Any]]) -> str:
    parts = []
    for i, chunk in enumerate(chunks, 1):
        page = chunk["metadata"].get("page", "?")
        filename = chunk["metadata"].get("filename", "document")
        score = chunk.get("score", 0)
        parts.append(
            f"[Source {i} | {filename} | Page {page} | Relevance: {score:.2f}]\n"
            f"{chunk['text']}"
        )
    return "\n\n---\n\n".join(parts)


def _make_messages(question: str, chunks: List[Dict[str, Any]]) -> tuple:
    context = build_context(chunks)
    user_msg = f"Context:\n{context}\n\nQuestion: {question}\n\nAnswer:"
    return context, user_msg


def generate_answer(
    question: str,
    chunks: List[Dict[str, Any]],
    model: str = "llama-3.3-70b-versatile",
    temperature: float = 0.1,
    max_tokens: int = 1024
) -> Dict[str, Any]:
    """Non-streaming: returns full answer + metrics dict."""
    client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))
    context, user_msg = _make_messages(question, chunks)

    t0 = time.perf_counter()
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_msg}
        ],
        temperature=temperature,
        max_tokens=max_tokens
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000
    answer = response.choices[0].message.content or ""
    usage  = response.usage

    return {
        "answer": answer,
        "prompt_info": {
            "system":      SYSTEM_PROMPT,
            "context":     context,
            "question":    question,
            "full_prompt": f"{SYSTEM_PROMPT}\n\n{user_msg}"
        },
        "metrics": {
            "llm_response_time_ms": round(elapsed_ms, 2),
            "prompt_tokens":       usage.prompt_tokens       if usage else 0,
            "completion_tokens":   usage.completion_tokens   if usage else 0,
            "total_tokens":        usage.total_tokens        if usage else 0
        }
    }


def stream_answer(
    question: str,
    chunks: List[Dict[str, Any]],
    model: str = "llama-3.3-70b-versatile",
    temperature: float = 0.1,
    max_tokens: int = 1024
) -> Generator[str, None, None]:
    """Streaming: yields text tokens one-by-one from Groq."""
    client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))
    _, user_msg = _make_messages(question, chunks)

    stream = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_msg}
        ],
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True
    )

    for chunk in stream:
        token = chunk.choices[0].delta.content
        if token:
            yield token
