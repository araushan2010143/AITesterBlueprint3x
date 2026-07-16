"""
Search endpoints with:
  - Authorization-scoped Pinecone retrieval (team_id metadata filter)
  - Source citations on every /ask response
  - Fallback / abstain behaviour when retrieval confidence is below threshold
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from typing import Any, Dict, Optional

from backend.database.db import get_session
from backend.models.schemas import SearchRequest, SearchResponse, SearchResult
from backend.retrieval.hybrid_search import search as hybrid_search
from backend.retrieval.reranker import rerank
from backend.llm.groq_llm import rag_answer
from backend.services.citation_service import (
    build_citations,
    format_answer_with_citations,
)
from backend.config import get_settings
from backend.abac.decorators import require_permission
from backend.abac.engine import RESOURCE_DOCUMENT, ACTION_READ

router = APIRouter(prefix="/api/search", tags=["Search"])
settings = get_settings()


def _build_filter(req: SearchRequest, team_id: Optional[str] = None):
    """
    Build Pinecone metadata filter.
    team_id enforcement: when provided, ONLY vectors from that team are returned.
    This is the authorization layer for multi-tenant retrieval.
    """
    f = {}
    # Authorization scope — filter by team_id if caller has one
    if team_id:
        f["team_id"] = {"$eq": team_id}
    # User-supplied facet filters
    if req.module:
        f["module"] = {"$eq": req.module}
    if req.priority:
        f["priority"] = {"$eq": req.priority}
    if req.document_type:
        f["document_type"] = {"$eq": req.document_type}
    if req.release:
        f["release"] = {"$eq": req.release}
    if req.author:
        f["author"] = {"$eq": req.author}
    if req.automation_status:
        f["automation_status"] = {"$eq": req.automation_status}
    return f or None


@router.post("", response_model=SearchResponse)
def search(
    req: SearchRequest,
    session: Session = Depends(get_session),
    user: Dict[str, Any] = Depends(require_permission(RESOURCE_DOCUMENT, ACTION_READ)),
):
    if not req.query.strip():
        raise HTTPException(400, "Query cannot be empty")

    # team_id always comes from the verified JWT context, not a caller-supplied param
    pinecone_filter = _build_filter(req, team_id=user.get("team_id"))
    raw_results, latency_ms = hybrid_search(
        query_text=req.query,
        top_k=req.top_k * 2,   # over-fetch for reranker
        pinecone_filter=pinecone_filter,
        bm25_weight=req.bm25_weight,
    )

    if req.use_reranker:
        raw_results = rerank(req.query, raw_results, top_k=req.top_k)
    else:
        raw_results = raw_results[:req.top_k]

    results = []
    for r in raw_results:
        meta = r.get("metadata", {})
        results.append(SearchResult(
            chunk_id=r["chunk_id"],
            doc_id=meta.get("doc_id", ""),
            filename=meta.get("filename", "Unknown"),
            text=r["text"],
            score=r["score"],
            page=int(meta.get("page", 0)),
            metadata=meta,
        ))

    return SearchResponse(
        query=req.query,
        results=results,
        total=len(results),
        latency_ms=latency_ms,
    )


@router.post("/ask")
def ask(
    req: SearchRequest,
    session: Session = Depends(get_session),
    user: Dict[str, Any] = Depends(require_permission(RESOURCE_DOCUMENT, ACTION_READ)),
):
    """
    RAG Q&A — retrieve context, build citations, generate grounded answer.

    Response envelope:
      answer           — LLM-generated answer (or abstain message if confidence low)
      abstained        — true when best retrieval score < threshold
      confidence       — {level, best_score, threshold}
      citations        — [{chunk_id, doc_id, filename, page, section, excerpt, score, ...}]
      citation_count   — total retrieved chunks (not just top-N)
      tokens_used      — LLM token count
      search_latency_ms
      llm_latency_ms
      retrieved_at     — ISO-8601 timestamp
    """
    if not req.query.strip():
        raise HTTPException(400, "Query cannot be empty")

    pinecone_filter = _build_filter(req, team_id=user.get("team_id"))
    raw_results, search_latency_ms = hybrid_search(
        query_text=req.query,
        top_k=req.top_k,
        pinecone_filter=pinecone_filter,
        bm25_weight=req.bm25_weight,
    )

    # Build structured citations from every retrieved chunk
    citations = build_citations(raw_results)

    # Check if we have enough confidence to answer
    from backend.services.citation_service import should_abstain, abstain_message, ABSTAIN_THRESHOLD
    do_abstain, best_score = should_abstain(citations)

    tokens_used = 0
    llm_latency_ms = 0

    if do_abstain:
        answer = abstain_message(req.query, best_score)
    else:
        if req.use_reranker and raw_results:
            raw_results = rerank(req.query, raw_results, top_k=req.top_k)
        llm_result = rag_answer(req.query, raw_results)
        answer = llm_result["answer"]
        tokens_used = llm_result.get("tokens_used", 0)
        llm_latency_ms = llm_result.get("latency_ms", 0)

    from datetime import datetime, timezone
    return {
        "answer": answer,
        "abstained": do_abstain,
        "confidence": {
            "level": (
                "none" if do_abstain else
                "high" if best_score >= 0.80 else
                "medium" if best_score >= 0.55 else
                "low"
            ),
            "best_score": round(best_score, 4),
            "threshold": ABSTAIN_THRESHOLD,
        },
        "citations": citations[:settings.retrieval_top_n_citations],
        "citation_count": len(citations),
        "tokens_used": tokens_used,
        "search_latency_ms": search_latency_ms,
        "llm_latency_ms": llm_latency_ms,
        "retrieved_at": datetime.now(tz=timezone.utc).isoformat(),
    }
