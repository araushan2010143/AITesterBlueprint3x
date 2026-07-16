"""
Chunk deduplication — two-layer check before Pinecone upsert:
  1. SHA-256 hash of chunk text   — exact dedup against SQLite Chunk table
  2. Pinecone cosine similarity   — near-dedup at NEAR_DUP_THRESHOLD (0.97)

Call deduplicate(chunks, embeddings) between embed and upsert steps.
"""
import hashlib
import logging
from typing import Dict, Any, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

NEAR_DUP_THRESHOLD = 0.97


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _load_existing_hashes() -> Set[str]:
    """Load SHA-256 hashes of all chunk texts already stored in SQLite."""
    try:
        from sqlmodel import Session, select
        from backend.database.db import engine, Chunk
        with Session(engine) as db:
            chunks = db.exec(select(Chunk)).all()
            return {_sha256(c.text) for c in chunks}
    except Exception as exc:
        logger.warning("Dedup: could not load existing hashes: %s", exc)
        return set()


def _is_near_duplicate(embedding: List[float]) -> bool:
    """Return True if Pinecone already has a vector with cosine ≥ NEAR_DUP_THRESHOLD."""
    try:
        from backend.vectorstore import query as vs_query
        results = vs_query(embedding, top_k=1, namespace="")
        if results and results[0]["score"] >= NEAR_DUP_THRESHOLD:
            return True
    except Exception as exc:
        logger.debug("Dedup: Pinecone similarity check failed: %s", exc)
    return False


def deduplicate(
    chunks: List[Dict[str, Any]],
    embeddings: List[List[float]],
    *,
    check_near_dup: bool = True,
    existing_hashes: Optional[Set[str]] = None,
) -> Tuple[List[Dict[str, Any]], List[List[float]], int]:
    """
    Filter out exact and near-duplicate chunks.

    Returns:
        (kept_chunks, kept_embeddings, skip_count)
    """
    if existing_hashes is None:
        existing_hashes = _load_existing_hashes()

    kept_chunks: List[Dict[str, Any]] = []
    kept_embeddings: List[List[float]] = []
    seen_in_batch: Set[str] = set()
    skip_count = 0

    for chunk, emb in zip(chunks, embeddings):
        text = chunk.get("text", "")
        h = _sha256(text)

        # Layer 1: exact hash match (DB or within this batch)
        if h in existing_hashes or h in seen_in_batch:
            skip_count += 1
            logger.debug("Dedup: exact duplicate skipped (hash=%.12s)", h)
            continue

        # Layer 2: near-duplicate via Pinecone cosine similarity
        if check_near_dup and _is_near_duplicate(emb):
            skip_count += 1
            logger.debug("Dedup: near-duplicate skipped (cosine ≥ %.2f)", NEAR_DUP_THRESHOLD)
            continue

        seen_in_batch.add(h)
        kept_chunks.append(chunk)
        kept_embeddings.append(emb)

    if skip_count:
        logger.info("Dedup: skipped %d/%d duplicate chunks", skip_count, len(chunks))

    return kept_chunks, kept_embeddings, skip_count
