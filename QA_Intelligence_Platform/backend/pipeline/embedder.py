"""
Embedder — three modes, auto-selected by priority:

  1. OpenAIEmbedder   (OPENAI_API_KEY set, 1024-dim)
       text-embedding-3-small via API. Zero local RAM. ~30s for 1000 chunks.
       Activated automatically when OPENAI_API_KEY is present in .env.

  2. BGEEmbedder      (default, 1024-dim)
       BAAI/bge-m3 via FlagEmbedding. Requires ~2.5 GB RAM.

  3. LightweightEmbedder  (USE_LIGHTWEIGHT_EMBEDDER=true, 384-dim)
       sentence-transformers/all-MiniLM-L6-v2. Requires ~200 MB RAM.

Priority: OpenAI > BGE > Lightweight.
Force override: USE_LIGHTWEIGHT_EMBEDDER=true skips OpenAI check.
"""
from __future__ import annotations
import os
from functools import lru_cache


class BGEEmbedder:
    _BATCH_SIZE = 2  # keep small to stay within RAM on CPU-only machines

    def __init__(self, model_name: str = "BAAI/bge-m3", device: str = "cpu"):
        from FlagEmbedding import BGEM3FlagModel
        self._model = BGEM3FlagModel(model_name, use_fp16=(device != "cpu"))

    def embed(self, texts: list[str]) -> list[list[float]]:
        output = self._model.encode(
            texts,
            batch_size=self._BATCH_SIZE,
            max_length=512,
            return_dense=True,
            return_sparse=False,
            return_colbert_vecs=False,
        )
        return output["dense_vecs"].tolist()

    def embed_with_sparse(self, texts: list[str]) -> dict:
        output = self._model.encode(
            texts,
            batch_size=self._BATCH_SIZE,
            max_length=512,
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
        return 1024


class LightweightEmbedder:
    """
    sentence-transformers/all-MiniLM-L6-v2 — 90 MB, 384-dim, ~200 MB RAM.
    Already cached at ~/.cache/huggingface/hub/. Activated via
    USE_LIGHTWEIGHT_EMBEDDER=true in .env.
    """
    _MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
    _BATCH_SIZE = 32  # small model can handle larger batches

    def __init__(self) -> None:
        from sentence_transformers import SentenceTransformer
        # Force CPU — MPS (Apple Metal) shader JIT compilation OOMs on constrained systems
        self._model = SentenceTransformer(self._MODEL_NAME, device="cpu")

    def embed(self, texts: list[str]) -> list[list[float]]:
        vecs = self._model.encode(
            texts,
            batch_size=self._BATCH_SIZE,
            show_progress_bar=False,
            normalize_embeddings=True,
        )
        return vecs.tolist()

    def embed_with_sparse(self, texts: list[str]) -> dict:
        # LightweightEmbedder has no sparse path; return empty weights
        return {"dense": self.embed(texts), "sparse": [{} for _ in texts]}

    @property
    def dimension(self) -> int:
        return 384


class OpenAIEmbedder:
    """
    text-embedding-3-small via OpenAI API.
    1024-dim (requested via dimensions param), zero local RAM, ~30s per 1000 chunks.
    Auto-activated when OPENAI_API_KEY is set and USE_LIGHTWEIGHT_EMBEDDER is not true.
    """
    _MODEL = "text-embedding-3-small"
    _DIM   = 1024
    _BATCH = 500  # OpenAI allows up to 2048 inputs per request

    def __init__(self, api_key: str) -> None:
        from openai import OpenAI
        self._client = OpenAI(api_key=api_key)

    def embed(self, texts: list[str]) -> list[list[float]]:
        results = []
        for i in range(0, len(texts), self._BATCH):
            batch = texts[i: i + self._BATCH]
            # Truncate to 8191 tokens max (API limit)
            batch = [t[:32000] for t in batch]
            response = self._client.embeddings.create(
                model=self._MODEL,
                input=batch,
                dimensions=self._DIM,
            )
            results.extend([item.embedding for item in response.data])
        return results

    def embed_with_sparse(self, texts: list[str]) -> dict:
        return {"dense": self.embed(texts), "sparse": [{} for _ in texts]}

    @property
    def dimension(self) -> int:
        return self._DIM


@lru_cache(maxsize=1)
def get_embedder() -> "BGEEmbedder | LightweightEmbedder | OpenAIEmbedder":
    """Singleton embedder — chosen once per process."""
    if os.getenv("USE_LIGHTWEIGHT_EMBEDDER", "").lower() in ("1", "true", "yes"):
        print("⚡ Using LightweightEmbedder (all-MiniLM-L6-v2, 384-dim)")
        return LightweightEmbedder()

    from config import get_settings
    s = get_settings()

    if s.openai_api_key:
        print(f"🌐 Using OpenAIEmbedder (text-embedding-3-small, {OpenAIEmbedder._DIM}-dim)")
        return OpenAIEmbedder(api_key=s.openai_api_key)

    print(f"🧠 Using BGEEmbedder ({s.embedding_model}, 1024-dim)")
    return BGEEmbedder(model_name=s.embedding_model, device=s.embedding_device)
