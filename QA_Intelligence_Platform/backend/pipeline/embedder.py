"""
Embedder — BAAI/bge-m3 for dense + sparse + multi-vector embeddings.

Why bge-m3:
- Multilingual (100+ languages)
- Dense retrieval (standard vector search)
- Sparse retrieval (BM25-like lexical matching)
- Multi-vector support (ColBERT-style)
- State-of-the-art on BEIR benchmark
- Works brilliantly for code + docs together

Lazy-loaded on first use to avoid slow startup when model isn't needed.
"""
from __future__ import annotations
from functools import lru_cache


class BGEEmbedder:
    def __init__(self, model_name: str = "BAAI/bge-m3", device: str = "cpu"):
        from FlagEmbedding import BGEM3FlagModel
        self._model = BGEM3FlagModel(model_name, use_fp16=(device != "cpu"))

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Return dense embeddings for a list of texts."""
        output = self._model.encode(
            texts,
            batch_size=12,
            max_length=8192,
            return_dense=True,
            return_sparse=False,
            return_colbert_vecs=False,
        )
        return output["dense_vecs"].tolist()

    def embed_with_sparse(self, texts: list[str]) -> dict:
        """Return both dense and sparse embeddings (for Qdrant hybrid upload)."""
        output = self._model.encode(
            texts,
            batch_size=12,
            max_length=8192,
            return_dense=True,
            return_sparse=True,
            return_colbert_vecs=False,
        )
        return {
            "dense":  output["dense_vecs"].tolist(),
            "sparse": output["lexical_weights"],
        }

    @property
    def dimension(self) -> int:
        return 1024  # bge-m3 dense dimension


@lru_cache(maxsize=1)
def get_embedder() -> BGEEmbedder:
    """Singleton embedder — model loads once, shared across all requests."""
    from config import get_settings
    s = get_settings()
    return BGEEmbedder(model_name=s.embedding_model, device=s.embedding_device)
