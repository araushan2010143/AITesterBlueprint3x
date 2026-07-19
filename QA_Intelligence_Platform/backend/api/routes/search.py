"""Structured search endpoint — hybrid retrieval with metadata filters."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Any

router = APIRouter()


class SearchRequest(BaseModel):
    query: str
    collections: list[str] | None = None   # override auto-routing
    filters: dict[str, Any] | None = None  # e.g. {"sprint": "Sprint-17", "severity": "high"}
    top_k: int = 5


class SearchResult(BaseModel):
    text: str
    score: float
    collection: str
    metadata: dict


class SearchResponse(BaseModel):
    results: list[SearchResult]
    intent: str
    collections_searched: list[str]
    total: int


@router.post("", response_model=SearchResponse)
def search(req: SearchRequest):
    """
    Hybrid search across Qdrant collections.
    Auto-routes to relevant collection(s) via intent classification.
    Supports metadata pre-filters (sprint, severity, module, framework…).
    """
    from knowledge import RetrievalEngine
    engine = RetrievalEngine()
    try:
        result = engine.retrieve(
            query=req.query,
            metadata_filters=req.filters,
            top_k=req.top_k,
            collections_override=req.collections or [],
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")
    return SearchResponse(
        results=[
            SearchResult(
                text=c.text,
                score=round(c.score, 4),
                collection=c.collection,
                metadata=c.metadata,
            )
            for c in result.chunks
        ],
        intent=result.intent,
        collections_searched=result.collections_searched,
        total=len(result.chunks),
    )
