"""
Embedder — four modes, auto-selected by priority:

  1. HFInferenceEmbedder  (HF_API_KEY set, 1024-dim)               ← FREE, zero RAM
       BAAI/bge-m3 via HF Inference API. Recommended for free-tier deployments.
       Get a free token at huggingface.co/settings/tokens.

  2. OpenAIEmbedder       (OPENAI_API_KEY set, 1024-dim)
       text-embedding-3-small via OpenAI API. Zero local RAM.

  3. BGEEmbedder          (default, 1024-dim)
       BAAI/bge-m3 via FlagEmbedding locally. Requires ~2.5 GB RAM.

  4. LightweightEmbedder  (USE_LIGHTWEIGHT_EMBEDDER=true, 384-dim)
       sentence-transformers/all-MiniLM-L6-v2. Requires ~200 MB RAM.

Priority: HF API > OpenAI > BGE local > Lightweight.
Force override: USE_LIGHTWEIGHT_EMBEDDER=true skips all API checks.
"""
from __future__ import annotations
import os
from functools import lru_cache


class HFInferenceEmbedder:
    """
    BAAI/bge-m3 via Hugging Face Inference API — zero local RAM, 1024-dim.
    Same dimension as BGEEmbedder so Qdrant collections are compatible.
    Free HF token: huggingface.co/settings/tokens (read role is enough).
    """
    _MODEL = "BAAI/bge-m3"
    _DIM = 1024
    _BATCH = 8  # stay under free-tier rate limits

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def _pool_and_normalize(self, raw) -> list[list[float]]:
        import numpy as np
        arr = np.array(raw, dtype=np.float32)
        # HF API returns (batch, seq_len, hidden) for encoder models
        # mean-pool the sequence dimension, then L2-normalize
        if arr.ndim == 3:
            vecs = arr.mean(axis=1)
        elif arr.ndim == 2:
            vecs = arr
        else:
            vecs = arr.reshape(1, -1)
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        vecs = vecs / np.where(norms == 0, 1.0, norms)
        return vecs.tolist()

    def _call_api(self, batch: list[str]) -> list[list[float]]:
        import urllib.request
        import urllib.error
        import json as _json
        from tenacity import retry, stop_after_attempt, wait_exponential

        # Use stdlib urllib — avoids httpx async-context issues on Render/uvicorn.
        @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
        def _post():
            payload = _json.dumps(
                {"inputs": batch, "options": {"wait_for_model": True}}
            ).encode()
            req = urllib.request.Request(
                f"https://api-inference.huggingface.co/models/{self._MODEL}",
                data=payload,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=90) as resp:
                    body = _json.loads(resp.read())
                return self._pool_and_normalize(body)
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", errors="replace")
                print(f"[HFEmbedder] HTTP {e.code} {e.reason}: {body[:300]}")
                raise RuntimeError(f"HF API HTTP {e.code}: {body[:200]}") from e
            except urllib.error.URLError as e:
                print(f"[HFEmbedder] URLError: {e.reason}")
                raise RuntimeError(f"HF API network error: {e.reason}") from e

        return _post()

    def embed(self, texts: list[str]) -> list[list[float]]:
        results = []
        for i in range(0, len(texts), self._BATCH):
            results.extend(self._call_api(texts[i: i + self._BATCH]))
        return results

    def embed_with_sparse(self, texts: list[str]) -> dict:
        # HF Inference API returns dense only; sparse weights not available via REST
        return {"dense": self.embed(texts), "sparse": [{} for _ in texts]}

    def embed_with_fallback(self, texts: list[str]) -> list[list[float]]:
        """Try HF API; on failure fall back to Cohere then OpenAI (both 1024-dim)."""
        try:
            return self.embed(texts)
        except Exception as hf_exc:
            import os
            cohere_key = os.getenv("COHERE_API_KEY", "")
            if cohere_key:
                print(f"[HFEmbedder] HF failed, falling back to Cohere: {hf_exc}")
                return CohereEmbedder(cohere_key).embed(texts)
            oai_key = os.getenv("OPENAI_API_KEY", "")
            if oai_key:
                print(f"[HFEmbedder] HF failed, falling back to OpenAI: {hf_exc}")
                return OpenAIEmbedder(oai_key).embed(texts)
            raise

    @property
    def dimension(self) -> int:
        return self._DIM


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


class CohereEmbedder:
    """
    Cohere embed-multilingual-v3.0 — 1024-dim, free tier 5 M tokens/month.
    Same dimension as HFInferenceEmbedder / OpenAIEmbedder — Qdrant collections compatible.
    Free key: dashboard.cohere.com (no credit card needed).
    Auto-activated when COHERE_API_KEY is set.
    """
    _MODEL = "embed-multilingual-v3.0"
    _DIM   = 1024
    _BATCH = 96  # Cohere allows up to 96 texts per request

    def __init__(self, api_key: str) -> None:
        import cohere
        self._client = cohere.Client(api_key)

    def embed(self, texts: list[str]) -> list[list[float]]:
        results = []
        for i in range(0, len(texts), self._BATCH):
            batch = texts[i: i + self._BATCH]
            resp = self._client.embed(
                texts=batch,
                model=self._MODEL,
                input_type="search_document",
            )
            results.extend(resp.embeddings)
        return results

    def embed_with_sparse(self, texts: list[str]) -> dict:
        return {"dense": self.embed(texts), "sparse": [{} for _ in texts]}

    @property
    def dimension(self) -> int:
        return self._DIM


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
def get_embedder() -> "HFInferenceEmbedder | OpenAIEmbedder | BGEEmbedder | LightweightEmbedder":
    """Singleton embedder — chosen once per process."""
    if os.getenv("USE_LIGHTWEIGHT_EMBEDDER", "").lower() in ("1", "true", "yes"):
        print("⚡ Using LightweightEmbedder (all-MiniLM-L6-v2, 384-dim)")
        return LightweightEmbedder()

    from config import get_settings
    s = get_settings()

    if s.hf_api_key:
        print(f"🤗 Using HFInferenceEmbedder (BAAI/bge-m3 via API, {HFInferenceEmbedder._DIM}-dim)")
        return HFInferenceEmbedder(api_key=s.hf_api_key)

    if s.cohere_api_key:
        print(f"🟣 Using CohereEmbedder (embed-multilingual-v3.0, {CohereEmbedder._DIM}-dim)")
        return CohereEmbedder(api_key=s.cohere_api_key)

    if s.openai_api_key:
        print(f"🌐 Using OpenAIEmbedder (text-embedding-3-small, {OpenAIEmbedder._DIM}-dim)")
        return OpenAIEmbedder(api_key=s.openai_api_key)

    try:
        import FlagEmbedding  # noqa: F401
    except ImportError:
        raise RuntimeError(
            "No embedding backend configured.\n"
            "Set HF_API_KEY (free read token from huggingface.co/settings/tokens) "
            "in your Render / deployment environment variables, "
            "or set OPENAI_API_KEY to use OpenAI embeddings.\n"
            "BGEEmbedder requires FlagEmbedding+torch which are not installed "
            "in this deployment (requirements-api.txt)."
        )
    print(f"🧠 Using BGEEmbedder ({s.embedding_model}, 1024-dim) — needs ~2.5 GB RAM")
    return BGEEmbedder(model_name=s.embedding_model, device=s.embedding_device)
