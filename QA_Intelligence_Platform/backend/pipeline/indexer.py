"""
Indexer — upsert chunks into Qdrant with incremental indexing via SHA256.

Incremental logic:
    Compute SHA256 of chunk text
    → Look up in index_registry table
    → Changed or new? → embed + upsert
    → Unchanged?      → skip (save compute + embedding cost)
"""
from __future__ import annotations
import hashlib
import uuid
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pipeline.chunker import Chunk


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


class Indexer:
    def __init__(self):
        self._qdrant = None
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

    def index(
        self,
        chunks: list["Chunk"],
        collection_name: str,
    ) -> dict:
        """
        Embed and upsert chunks into Qdrant.
        Skips chunks whose SHA256 matches what's already in the DB.

        Returns:
            {"indexed": int, "skipped": int, "collection": str}
        """
        from collections_module.manager import ensure_collection  # noqa: F401
        from database.registry import load_hashes, save_hash

        client   = self._get_qdrant()
        embedder = self._get_embedder()

        ensure_collection(client, collection_name, vector_size=embedder.dimension)

        # Load existing hashes for this collection
        existing_hashes = load_hashes(collection_name)

        to_index = []
        skipped  = 0
        for chunk in chunks:
            sha = _sha256(chunk.text)
            if sha in existing_hashes:
                skipped += 1
                continue
            to_index.append((chunk, sha))

        if not to_index:
            return {"indexed": 0, "skipped": skipped, "collection": collection_name}

        texts    = [c.text for c, _ in to_index]
        try:
            vectors = embedder.embed(texts)
        except Exception as exc:
            raise RuntimeError(
                f"Embedding failed ({type(exc).__name__}: {exc}). "
                "Set HF_API_KEY (free HF read token) on Render if OpenAI is rate-limited."
            ) from exc

        from qdrant_client.models import PointStruct
        points = []
        for (chunk, sha), vector in zip(to_index, vectors):
            payload = {**chunk.metadata, "text": chunk.text, "sha256": sha}
            points.append(PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload=payload,
            ))

        client.upsert(collection_name=collection_name, points=points)

        for _, sha in to_index:
            save_hash(collection_name, sha)

        return {
            "indexed":    len(to_index),
            "skipped":    skipped,
            "collection": collection_name,
        }
