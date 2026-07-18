"""
Cross-encoder reranker — BAAI/bge-reranker-large.

Reranking is the single highest-ROI improvement in a RAG pipeline.
It re-scores every candidate chunk against the full query, giving far
more accurate results than vector similarity alone.

Especially effective for code queries like:
    "Where is switchMediaType() implemented?" — vector score alone is unreliable.
"""
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .retrieval_engine import RetrievedChunk


class Reranker:
    """
    Cross-encoder reranker. Disabled when RERANKER_ENABLED=false (default on
    RAM-constrained machines) — falls back to RRF score order from hybrid search.
    Enable in production with a GPU: RERANKER_ENABLED=true.
    """

    def __init__(self):
        import os
        self._enabled = os.getenv("RERANKER_ENABLED", "false").lower() in ("1", "true", "yes")
        self._model = None

    def _get_model(self):
        if self._model is None:
            from FlagEmbedding import FlagReranker
            from config import get_settings
            s = get_settings()
            self._model = FlagReranker(s.reranker_model, use_fp16=True)
        return self._model

    def rerank(
        self,
        query: str,
        chunks: list["RetrievedChunk"],
        top_k: int = 5,
    ) -> list["RetrievedChunk"]:
        if not chunks:
            return []

        if self._enabled:
            try:
                model = self._get_model()
                pairs = [[query, c.text] for c in chunks]
                scores = model.compute_score(pairs)
                if isinstance(scores, float):
                    scores = [scores]
                for chunk, score in zip(chunks, scores):
                    chunk.score = float(score)
                chunks.sort(key=lambda c: c.score, reverse=True)
            except Exception:
                pass  # fall through to RRF order

        return chunks[:top_k]
