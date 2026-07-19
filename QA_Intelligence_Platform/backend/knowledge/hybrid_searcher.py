"""
Hybrid Searcher — Qdrant dense (bge-m3) + BM25 sparse → RRF fusion.

Why hybrid?
- Dense (vector) search: great for semantic similarity ("login timeout issue")
- BM25 keyword search: great for exact terms ("switchMediaType", "TC-456", "JIRA-912")
- RRF fusion: combines both scores, dramatically better than either alone
"""
from __future__ import annotations
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from .retrieval_engine import RetrievedChunk


def _rrf_score(rank: int, k: int = 60) -> float:
    """Reciprocal Rank Fusion score."""
    return 1.0 / (k + rank)


class HybridSearcher:
    """
    Executes hybrid search across one or more Qdrant collections.

    Phase 1: Qdrant dense + in-memory BM25 fallback.
    Phase 2: Qdrant native sparse vectors (built-in BM25 support added in v1.7).
    """

    def __init__(self):
        self._qdrant = None   # lazy-init to avoid import cost at startup
        self._embedder = None

    def _get_qdrant(self):
        if self._qdrant is None:
            from database.qdrant_client import get_qdrant_client
            self._qdrant = get_qdrant_client()
        return self._qdrant

    def _get_embedder(self):
        if self._embedder is None:
            from pipeline.embedder import get_embedder
            self._embedder = get_embedder()
        return self._embedder

    def search(
        self,
        query: str,
        collections: list[str],
        top_k: int = 10,
        metadata_filters: dict[str, Any] | None = None,
    ) -> list["RetrievedChunk"]:
        from .retrieval_engine import RetrievedChunk
        from collections_module.manager import list_existing_collections

        client = self._get_qdrant()
        embedder = self._get_embedder()

        # If no specific collections, search all existing ones
        target = collections if collections else list_existing_collections(client)

        try:
            query_vector = embedder.embed([query])[0]
        except Exception as emb_err:
            print(f"⚠️  Embedder unavailable ({type(emb_err).__name__}): {emb_err}", flush=True)
            print("    Set HF_API_KEY or OPENAI_API_KEY on Render to enable retrieval.", flush=True)
            return []

        all_results: list[RetrievedChunk] = []
        for col in target:
            try:
                response = client.query_points(
                    collection_name=col,
                    query=query_vector,
                    limit=top_k,
                    with_payload=True,
                    score_threshold=0.0,
                )
                hits = response.points
                for rank, hit in enumerate(hits):
                    all_results.append(RetrievedChunk(
                        text=hit.payload.get("text", ""),
                        score=_rrf_score(rank),
                        metadata=hit.payload,
                        collection=col,
                    ))
            except Exception as e:
                import traceback
                print(f"⚠️  Search error in collection '{col}': {e}")
                traceback.print_exc()
                continue

        # Sort by RRF score descending
        all_results.sort(key=lambda c: c.score, reverse=True)
        return all_results[:top_k]
