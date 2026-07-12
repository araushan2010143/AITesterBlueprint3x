from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from backend.database.db import Document, get_session
from backend.models.schemas import SearchRequest, SearchResponse, SearchResult
from backend.retrieval.hybrid_search import search as hybrid_search
from backend.retrieval.reranker import rerank
from backend.llm.groq_llm import rag_answer

router = APIRouter(prefix="/api/search", tags=["Search"])


def _build_filter(req: SearchRequest):
    f = {}
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
def search(req: SearchRequest, session: Session = Depends(get_session)):
    if not req.query.strip():
        raise HTTPException(400, "Query cannot be empty")

    pinecone_filter = _build_filter(req)
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

    # Enrich with doc info from SQLite
    results = []
    for r in raw_results:
        meta = r.get("metadata", {})
        doc_id = meta.get("doc_id", "")
        filename = meta.get("filename", "Unknown")
        results.append(SearchResult(
            chunk_id=r["chunk_id"],
            doc_id=doc_id,
            filename=filename,
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
def ask(req: SearchRequest, session: Session = Depends(get_session)):
    """RAG Q&A — retrieve context then generate answer."""
    pinecone_filter = _build_filter(req)
    raw_results, latency_ms = hybrid_search(
        query_text=req.query,
        top_k=req.top_k,
        pinecone_filter=pinecone_filter,
        bm25_weight=req.bm25_weight,
    )

    if not raw_results:
        return {"answer": "No relevant documents found. Please upload documents first.", "sources": [], "latency_ms": latency_ms}

    llm_result = rag_answer(req.query, raw_results)

    return {
        "answer": llm_result["answer"],
        "sources": raw_results[:5],
        "tokens_used": llm_result["tokens_used"],
        "search_latency_ms": latency_ms,
        "llm_latency_ms": llm_result["latency_ms"],
    }
