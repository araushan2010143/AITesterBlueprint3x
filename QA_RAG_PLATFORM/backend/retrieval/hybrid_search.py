"""
Hybrid search: Dense (Pinecone cosine) + Sparse (BM25).
score = dense_weight * dense_score + bm25_weight * bm25_score
"""
import time
from typing import List, Dict, Any, Optional
from rank_bm25 import BM25Okapi
from sqlmodel import Session, select
from backend.database.db import Chunk, engine
from backend.embeddings.mistral_embedder import embed_query
from backend.vectorstore import pinecone_store
from backend.config import get_settings

settings = get_settings()

# In-memory BM25 index — rebuilt lazily when stale
_bm25: Optional[BM25Okapi] = None
_bm25_corpus: List[Dict[str, Any]] = []   # [{chunk_id, doc_id, text}]
_bm25_dirty = True


def _rebuild_bm25():
    global _bm25, _bm25_corpus, _bm25_dirty
    with Session(engine) as session:
        chunks = session.exec(select(Chunk)).all()
    _bm25_corpus = [{"chunk_id": c.id, "doc_id": c.doc_id, "text": c.text} for c in chunks]
    tokenized = [c["text"].lower().split() for c in _bm25_corpus]
    _bm25 = BM25Okapi(tokenized) if tokenized else None
    _bm25_dirty = False


def invalidate_bm25():
    global _bm25_dirty
    _bm25_dirty = True


def _normalize(scores: List[float]) -> List[float]:
    mn, mx = min(scores, default=0), max(scores, default=1)
    if mx == mn:
        return [1.0] * len(scores)
    return [(s - mn) / (mx - mn) for s in scores]


def search(
    query_text: str,
    top_k: int = 10,
    namespace: str = "",
    pinecone_filter: Optional[Dict] = None,
    bm25_weight: float = None,
) -> tuple[List[Dict[str, Any]], float]:
    """
    Returns (results, latency_ms).
    Each result: {chunk_id, text, score, metadata, doc_id}.
    """
    global _bm25, _bm25_dirty
    t0 = time.perf_counter()
    bm25_w = bm25_weight if bm25_weight is not None else settings.bm25_weight
    dense_w = 1.0 - bm25_w

    # --- Dense search ---
    qvec = embed_query(query_text)
    dense_results = pinecone_store.query(
        embedding=qvec,
        top_k=top_k * 2,
        namespace=namespace,
        filter=pinecone_filter,
    )
    dense_by_id = {r["chunk_id"]: r for r in dense_results}
    dense_scores = {r["chunk_id"]: r["score"] for r in dense_results}

    # --- BM25 search ---
    if _bm25_dirty:
        _rebuild_bm25()

    bm25_scores: Dict[str, float] = {}
    if _bm25 and _bm25_corpus:
        raw = _bm25.get_scores(query_text.lower().split())
        for i, score in enumerate(raw):
            if i < len(_bm25_corpus):
                bm25_scores[_bm25_corpus[i]["chunk_id"]] = float(score)

    # --- Merge ---
    all_ids = set(dense_scores.keys()) | set(bm25_scores.keys())
    norm_dense = {}
    norm_bm25 = {}

    if dense_scores:
        vals = list(dense_scores.values())
        norm_vals = _normalize(vals)
        norm_dense = dict(zip(dense_scores.keys(), norm_vals))

    if bm25_scores:
        vals = list(bm25_scores.values())
        norm_vals = _normalize(vals)
        norm_bm25 = dict(zip(bm25_scores.keys(), norm_vals))

    combined: List[Dict[str, Any]] = []
    for cid in all_ids:
        d = norm_dense.get(cid, 0.0)
        b = norm_bm25.get(cid, 0.0)
        hybrid_score = dense_w * d + bm25_w * b
        result = dense_by_id.get(cid)
        if result is None:
            # BM25-only hit — look up text from corpus
            corpus_item = next((x for x in _bm25_corpus if x["chunk_id"] == cid), None)
            if corpus_item is None:
                continue
            result = {
                "chunk_id": cid,
                "text": corpus_item["text"],
                "metadata": {"doc_id": corpus_item["doc_id"]},
                "score": hybrid_score,
            }
        else:
            result = dict(result)
        result["score"] = round(hybrid_score, 4)
        combined.append(result)

    combined.sort(key=lambda x: x["score"], reverse=True)
    latency_ms = round((time.perf_counter() - t0) * 1000, 1)
    return combined[:top_k], latency_ms
