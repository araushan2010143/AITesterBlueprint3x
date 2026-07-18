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
    def __init__(self):
        self._model = None  # lazy-init (model load is expensive)

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
        """Re-score chunks with cross-encoder, return top_k highest-scoring."""
        if not chunks:
            return []

        try:
            model = self._get_model()
            pairs = [[query, c.text] for c in chunks]
            scores = model.compute_score(pairs)
            if isinstance(scores, float):
                scores = [scores]
            for chunk, score in zip(chunks, scores):
                chunk.score = float(score)
        except Exception:
            # If reranker fails, fall back to original order
            pass

        chunks.sort(key=lambda c: c.score, reverse=True)
        return chunks[:top_k]
