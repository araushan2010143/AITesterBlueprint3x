"""Native ChromaDB retrieval with pre-computed query embeddings."""
import time
from typing import List, Dict, Any


def retrieve(
    collection,
    query_embedding: List[float],
    top_k: int = 4
) -> Dict[str, Any]:
    """
    Query ChromaDB with a pre-computed embedding vector.
    Returns chunks with cosine similarity scores in [0, 1].
    """
    t0 = time.perf_counter()

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, collection.count()),
        include=["documents", "metadatas", "distances"]
    )

    search_ms = (time.perf_counter() - t0) * 1000

    chunks: List[Dict[str, Any]] = []
    ids       = results["ids"][0]
    docs      = results["documents"][0]
    metas     = results["metadatas"][0]
    distances = results["distances"][0]

    for chunk_id, doc, meta, dist in zip(ids, docs, metas, distances):
        # hnsw:space=cosine → distance = 1 − cosine_similarity
        similarity = round(max(0.0, 1.0 - float(dist)), 4)
        chunks.append({
            "chunk_id": str(meta.get("chunk_index", chunk_id)),
            "text": doc,
            "metadata": dict(meta),
            "score": similarity
        })

    return {
        "chunks": chunks,
        "search_latency_ms": round(search_ms, 2)
    }
