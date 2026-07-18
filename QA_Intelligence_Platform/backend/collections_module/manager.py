"""Qdrant collection CRUD — create, ensure, list, delete."""
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from qdrant_client import QdrantClient


def ensure_collection(client: "QdrantClient", name: str, vector_size: int = 1024) -> None:
    """Create collection if it doesn't exist."""
    from qdrant_client.models import VectorParams, Distance
    existing = {c.name for c in client.get_collections().collections}
    if name not in existing:
        client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
        )


def list_existing_collections(client: "QdrantClient") -> list[str]:
    return [c.name for c in client.get_collections().collections]


def get_collection_stats(client: "QdrantClient") -> list[dict]:
    stats = []
    for col in client.get_collections().collections:
        info = client.get_collection(col.name)
        stats.append({
            "name":        col.name,
            "vectors":     info.vectors_count or 0,
            "points":      info.points_count or 0,
        })
    return stats


def delete_collection(client: "QdrantClient", name: str) -> bool:
    try:
        client.delete_collection(name)
        return True
    except Exception:
        return False
