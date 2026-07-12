"""Pinecone serverless — 1024-dim, cosine, index: qa-rag-platform."""
import time
from typing import List, Dict, Any, Optional
from pinecone import Pinecone, ServerlessSpec
from backend.config import get_settings

settings = get_settings()
_index = None


def get_index():
    global _index
    if _index is not None:
        return _index

    pc = Pinecone(api_key=settings.pinecone_api_key)
    existing = [i.name for i in pc.list_indexes()]

    if settings.pinecone_index_name not in existing:
        pc.create_index(
            name=settings.pinecone_index_name,
            dimension=settings.embedding_dim,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region=settings.pinecone_region),
        )
        for _ in range(30):
            status = pc.describe_index(settings.pinecone_index_name).status
            if status.get("ready", False):
                break
            time.sleep(2)

    _index = pc.Index(settings.pinecone_index_name)
    return _index


def upsert(chunks: List[Dict[str, Any]], embeddings: List[List[float]], namespace: str = "") -> int:
    index = get_index()
    vectors = []
    for chunk, emb in zip(chunks, embeddings):
        meta = {k: v for k, v in chunk["metadata"].items() if isinstance(v, (str, int, float, bool))}
        meta["text"] = chunk["text"][:4000]
        vectors.append({"id": chunk["id"], "values": emb, "metadata": meta})

    for i in range(0, len(vectors), 100):
        index.upsert(vectors=vectors[i : i + 100], namespace=namespace)

    return len(vectors)


def query(
    embedding: List[float],
    top_k: int = 10,
    namespace: str = "",
    filter: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    index = get_index()
    kwargs = dict(vector=embedding, top_k=top_k, include_metadata=True, namespace=namespace)
    if filter:
        kwargs["filter"] = filter
    results = index.query(**kwargs)
    return [
        {
            "chunk_id": m.id,
            "text": m.metadata.get("text", ""),
            "metadata": {k: v for k, v in m.metadata.items() if k != "text"},
            "score": round(float(m.score), 4),
        }
        for m in results.matches
    ]


def delete_namespace(namespace: str) -> None:
    try:
        get_index().delete(delete_all=True, namespace=namespace)
    except Exception:
        pass


def get_stats() -> Dict[str, Any]:
    try:
        stats = get_index().describe_index_stats()
        ns_dict = {}
        for ns_name, ns_data in (stats.namespaces or {}).items():
            ns_dict[ns_name] = getattr(ns_data, "vector_count", 0)
        return {"total_vectors": stats.total_vector_count, "namespaces": ns_dict}
    except Exception:
        return {"total_vectors": 0, "namespaces": {}}
