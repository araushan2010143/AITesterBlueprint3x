"""
Pinecone vector store — replaces ChromaDB for serverless/production.
Uses the Pinecone free tier: 1 serverless index, 768-dim, cosine metric.
"""
import os
import time
from typing import Any, Dict, List

from pinecone import Pinecone, ServerlessSpec

INDEX_NAME = os.environ.get("PINECONE_INDEX_NAME", "rag-explorer")
DIMENSION = 768


def _client() -> Pinecone:
    api_key = os.environ.get("PINECONE_API_KEY", "")
    if not api_key:
        raise RuntimeError(
            "PINECONE_API_KEY not set. "
            "Get a free key at https://pinecone.io and add it to your environment."
        )
    return Pinecone(api_key=api_key)


def get_index():
    """Return (and lazily create) the Pinecone index."""
    pc = _client()
    existing = [i.name for i in pc.list_indexes()]

    if INDEX_NAME not in existing:
        pc.create_index(
            name=INDEX_NAME,
            dimension=DIMENSION,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )
        # Block until index is ready (up to ~60s)
        for _ in range(30):
            if pc.describe_index(INDEX_NAME).status.get("ready", False):
                break
            time.sleep(2)

    return pc.Index(INDEX_NAME)


def upsert_chunks(
    index,
    chunks: List[Dict[str, Any]],
    embeddings: List[List[float]],
    namespace: str = "default",
) -> int:
    vectors = []
    for chunk, emb in zip(chunks, embeddings):
        meta = {
            k: v for k, v in chunk["metadata"].items()
            if isinstance(v, (str, int, float, bool))
        }
        meta["text"] = chunk["text"][:4000]
        vectors.append({"id": chunk["id"], "values": emb, "metadata": meta})

    for i in range(0, len(vectors), 100):
        index.upsert(vectors=vectors[i : i + 100], namespace=namespace)

    return len(vectors)


def query_vectors(
    index,
    query_embedding: List[float],
    top_k: int = 4,
) -> List[Dict[str, Any]]:
    """Query across ALL namespaces (no namespace filter = global search)."""
    results = index.query(
        vector=query_embedding,
        top_k=top_k,
        include_metadata=True,
    )
    chunks = []
    for match in results.matches:
        meta = {k: v for k, v in match.metadata.items() if k != "text"}
        chunks.append({
            "chunk_id": match.id,
            "text": match.metadata.get("text", ""),
            "metadata": meta,
            "score": round(float(match.score), 4),
        })
    return chunks


def get_stats(index) -> Dict[str, Any]:
    stats = index.describe_index_stats()
    ns_dict: Dict[str, Any] = {}
    for ns_name, ns_data in (stats.namespaces or {}).items():
        ns_dict[ns_name] = {"vector_count": getattr(ns_data, "vector_count", 0)}
    return {
        "total_vectors": stats.total_vector_count,
        "namespaces": ns_dict,
    }


def delete_all_vectors(index, namespace: str = "default") -> None:
    try:
        index.delete(delete_all=True, namespace=namespace)
    except Exception:
        pass  # Namespace may not exist yet; that's fine
