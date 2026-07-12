"""Mistral embed — 1024-dim vectors."""
from typing import List
from mistralai import Mistral
from backend.config import get_settings

settings = get_settings()
_client: Mistral = None


def _get_client() -> Mistral:
    global _client
    if _client is None:
        _client = Mistral(api_key=settings.mistral_api_key)
    return _client


def embed_texts(texts: List[str], batch_size: int = 100) -> List[List[float]]:
    """Embed a list of texts. Returns list of 1024-dim float vectors."""
    client = _get_client()
    all_embeddings: List[List[float]] = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        # Truncate to 8192 tokens (Mistral embed limit)
        batch = [t[:32000] for t in batch]
        response = client.embeddings.create(
            model=settings.embedding_model,
            inputs=batch,
        )
        all_embeddings.extend([e.embedding for e in response.data])

    return all_embeddings


def embed_query(text: str) -> List[float]:
    """Embed a single query string."""
    return embed_texts([text])[0]
