"""
Direct Nomic API embeddings — no LangChain wrapper.
Works on Python 3.9+ without any | union-type issues.
"""
import os
import time
from typing import List, Callable, Optional

import requests

NOMIC_API_URL = "https://api-atlas.nomic.ai/v1/embedding/text"
EMBEDDING_DIM = 768


def _call_nomic(texts: List[str], task_type: str, model: str) -> List[List[float]]:
    api_key = os.environ.get("NOMIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "NOMIC_API_KEY is not set. "
            "Get a free key at https://atlas.nomic.ai and add it to backend/.env"
        )
    resp = requests.post(
        NOMIC_API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        },
        json={"texts": texts, "model": model, "task_type": task_type},
        timeout=120
    )
    resp.raise_for_status()
    return resp.json()["embeddings"]


def embed_documents(
    texts: List[str],
    model: str = "nomic-embed-text-v1.5",
    batch_size: int = 64,
    progress_cb: Optional[Callable[[int, int], None]] = None
) -> List[List[float]]:
    """Embed a corpus of texts (search_document task) in batches."""
    all_embeddings: List[List[float]] = []
    total = len(texts)

    for i in range(0, total, batch_size):
        batch = texts[i : i + batch_size]
        all_embeddings.extend(_call_nomic(batch, "search_document", model))
        if progress_cb:
            progress_cb(min(i + batch_size, total), total)

    return all_embeddings


def embed_query(text: str, model: str = "nomic-embed-text-v1.5") -> List[float]:
    """Embed a single user query (search_query task)."""
    return _call_nomic([text], "search_query", model)[0]


def get_embedding_dimension() -> int:
    return EMBEDDING_DIM
