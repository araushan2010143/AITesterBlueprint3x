"""
FastAPI route handlers — native ChromaDB + direct Nomic API.
No LangChain vector store wrappers; fully Python 3.9 compatible.
"""
import json
import time
from pathlib import Path
from typing import List, Optional

import fitz  # PyMuPDF
from fastapi import APIRouter, Form, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse

from config import settings
from state import app_state
from models import (
    QueryRequest, ReindexRequest,
    IngestResponse, QueryResponse, AllMetrics, AppStatus,
    ChunkInfo, DocumentInfo, RetrievedChunk, PromptInfo, QueryMetrics
)
from ingestion.pdf_loader import chunk_documents
from embeddings.embedder import embed_documents, embed_query, get_embedding_dimension
from vectorstore.chroma_store import (
    get_client, get_or_create_collection, recreate_collection,
    add_chunks_with_embeddings, collection_count
)
from retrieval.retriever import retrieve
from llm.groq_llm import generate_answer, stream_answer, build_context, SYSTEM_PROMPT

router = APIRouter()


# ── Internal helpers ──────────────────────────────────────────────────

def _run_ingestion_from_pages(pages: list, summary: dict, chunk_size: int, chunk_overlap: int, rebuild: bool = False) -> dict:
    t_total = time.perf_counter()
    app_state.status = "ingesting"
    app_state.error = None

    try:
        # Stage 2: Chunk
        app_state.set_progress("chunking", 0, len(pages), "Splitting pages into chunks…")
        chunks = chunk_documents(pages, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        app_state.set_progress("chunking", len(pages), len(pages),
            f"Created {len(chunks)} chunks (size={chunk_size}, overlap={chunk_overlap})")
        app_state.chunks = chunks
        app_state.documents = summary["files"]
        app_state.update_document_metrics(chunks)

        # Stage 3: Embed
        app_state.set_progress("embedding", 0, len(chunks),
            f"Generating embeddings for {len(chunks)} chunks via Nomic API…")
        t_embed = time.perf_counter()
        texts = [c["text"] for c in chunks]

        def _embed_progress(done: int, total: int):
            app_state.set_progress("embedding", done, total, f"Embedding {done}/{total} chunks…")

        embeddings = embed_documents(texts, model=settings.embedding_model, progress_cb=_embed_progress)
        embed_time = time.perf_counter() - t_embed
        app_state.update_embedding_metrics(settings.embedding_model, get_embedding_dimension(), embed_time, len(embeddings))

        # Stage 4: Store in ChromaDB
        app_state.set_progress("storing", 0, len(chunks), "Storing vectors in ChromaDB…")
        client = get_client(str(settings.chroma_path))

        if rebuild:
            collection = recreate_collection(client, settings.collection_name)
        else:
            collection = get_or_create_collection(client, settings.collection_name)
            existing = collection_count(collection)
            if existing > 0 and not rebuild:
                app_state.chroma_client = client
                app_state.collection = collection
                app_state.status = "ready"
                app_state.set_progress("complete", existing, existing,
                    f"Reusing existing index — {existing} vectors already stored.")
                return _build_response(summary, chunks, existing,
                                       time.perf_counter() - t_total, chunk_size, chunk_overlap)

        added = add_chunks_with_embeddings(collection, chunks, embeddings)
        app_state.chroma_client = client
        app_state.collection = collection

        app_state.set_progress("complete", added, added,
            f"Stored {added} vectors in ChromaDB ({settings.collection_name})")
        app_state.status = "ready"

        return _build_response(summary, chunks, added,
                               time.perf_counter() - t_total, chunk_size, chunk_overlap)

    except Exception as exc:
        app_state.status = "error"
        app_state.error = str(exc)
        app_state.set_progress("error", 0, 0, str(exc))
        raise


def _build_response(summary, chunks, vectors, elapsed, chunk_size, chunk_overlap) -> dict:
    return {
        "status": "complete",
        "documents_loaded": summary["documents"],
        "total_pages": summary["total_pages"],
        "total_chunks": len(chunks),
        "embeddings_created": vectors,
        "time_taken_seconds": round(elapsed, 2),
        "collection_name": settings.collection_name,
        "storage_path": str(settings.chroma_path),
        "chunk_size": chunk_size,
        "chunk_overlap": chunk_overlap
    }


def _require_ready():
    if app_state.status != "ready" or app_state.collection is None:
        raise HTTPException(
            status_code=503,
            detail="RAG pipeline not ready. Upload a PDF and click Ingest first."
        )


def _parse_pdf_bytes(content: bytes, filename: str) -> tuple:
    """Parse PDF bytes into pages + summary dict."""
    doc = fitz.open(stream=content, filetype="pdf")
    pages = []
    for page_num in range(len(doc)):
        text = doc[page_num].get_text("text").strip()
        if text:
            pages.append({
                "text": text,
                "metadata": {
                    "filename": filename,
                    "page": page_num + 1,
                    "doc_id": Path(filename).stem,
                    "total_pages": len(doc),
                    "source": filename,
                }
            })
    doc.close()
    summary = {
        "documents": 1,
        "total_pages": len(pages),
        "files": [{"filename": filename, "doc_id": Path(filename).stem, "total_pages": len(pages)}]
    }
    return pages, summary


# ── Routes ─────────────────────────────────────────────────────────────

@router.get("/status", response_model=AppStatus)
def get_status():
    return AppStatus(
        status=app_state.status,
        progress=app_state.progress,
        is_ready=app_state.status == "ready",
        error=app_state.error
    )


@router.post("/ingest", response_model=IngestResponse)
async def ingest(
    file: UploadFile = File(...),
    chunk_size: int = Form(800),
    chunk_overlap: int = Form(150),
):
    """Accept PDF upload, save to data dir, chunk, embed, store in ChromaDB."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")
    if app_state.status == "ingesting":
        raise HTTPException(409, "Ingestion already in progress")

    content = await file.read()
    # Persist to data dir so it survives restarts
    settings.data_path.mkdir(parents=True, exist_ok=True)
    (settings.data_path / file.filename).write_bytes(content)

    pages, summary = _parse_pdf_bytes(content, file.filename)
    if not pages:
        raise HTTPException(400, "No extractable text found in this PDF.")

    try:
        return IngestResponse(**_run_ingestion_from_pages(pages, summary, chunk_size, chunk_overlap, rebuild=False))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.post("/reindex", response_model=IngestResponse)
async def reindex(
    file: UploadFile = File(...),
    chunk_size: int = Form(800),
    chunk_overlap: int = Form(150),
):
    """Delete existing vectors and re-embed the uploaded PDF from scratch."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")
    if app_state.status == "ingesting":
        raise HTTPException(409, "Ingestion already in progress")

    content = await file.read()
    settings.data_path.mkdir(parents=True, exist_ok=True)
    (settings.data_path / file.filename).write_bytes(content)

    pages, summary = _parse_pdf_bytes(content, file.filename)
    if not pages:
        raise HTTPException(400, "No extractable text found in this PDF.")

    try:
        return IngestResponse(**_run_ingestion_from_pages(pages, summary, chunk_size, chunk_overlap, rebuild=True))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.get("/documents", response_model=List[DocumentInfo])
def list_documents():
    doc_chunks: dict = {}
    for c in app_state.chunks:
        doc_id = c["metadata"]["doc_id"]
        doc_chunks.setdefault(doc_id, []).append(c)

    results = []
    for doc in app_state.documents:
        doc_id = doc["doc_id"]
        results.append(DocumentInfo(
            id=doc_id,
            filename=doc["filename"],
            pages=doc["total_pages"],
            chunks_count=len(doc_chunks.get(doc_id, []))
        ))
    return results


@router.get("/chunks", response_model=List[ChunkInfo])
def list_chunks(doc_id: Optional[str] = None, page: Optional[int] = None):
    filtered = app_state.chunks
    if doc_id:
        filtered = [c for c in filtered if c["metadata"].get("doc_id") == doc_id]
    if page is not None:
        filtered = [c for c in filtered if c["metadata"].get("page") == page]
    return [
        ChunkInfo(
            id=c["id"],
            text=c["text"],
            metadata=c["metadata"],
            embedding_status="embedded" if app_state.status == "ready" else "pending",
            char_count=len(c["text"])
        )
        for c in filtered
    ]


@router.post("/query", response_model=QueryResponse)
def query(req: QueryRequest):
    _require_ready()

    t_query_start = time.perf_counter()

    # Embed query
    query_embedding = embed_query(req.question, settings.embedding_model)
    query_ms = (time.perf_counter() - t_query_start) * 1000

    # Retrieve top-k chunks from ChromaDB
    result = retrieve(app_state.collection, query_embedding, req.top_k)
    chunks = result["chunks"]
    search_ms = result["search_latency_ms"]

    if not chunks:
        return QueryResponse(
            answer="No relevant context found in the document for this question.",
            sources=[],
            prompt_used=PromptInfo(system="", context="", question=req.question, full_prompt=""),
            metrics=QueryMetrics(
                query_latency_ms=round(query_ms, 2),
                search_latency_ms=search_ms,
                llm_response_time_ms=0,
                prompt_tokens=0, completion_tokens=0, total_tokens=0
            )
        )

    # Generate answer with Groq
    llm_result = generate_answer(
        question=req.question,
        chunks=chunks,
        model=settings.groq_model,
        temperature=req.temperature,
        max_tokens=req.max_tokens
    )

    # Record metrics
    scores = [c["score"] for c in chunks]
    app_state.record_retrieval(query_ms, search_ms, scores, req.top_k)
    m = llm_result["metrics"]
    app_state.record_llm(settings.groq_model, m["llm_response_time_ms"],
                         m["prompt_tokens"], m["completion_tokens"])

    return QueryResponse(
        answer=llm_result["answer"],
        sources=[RetrievedChunk(**c) for c in chunks],
        prompt_used=PromptInfo(**llm_result["prompt_info"]),
        metrics=QueryMetrics(
            query_latency_ms=round(query_ms, 2),
            search_latency_ms=search_ms,
            llm_response_time_ms=m["llm_response_time_ms"],
            prompt_tokens=m["prompt_tokens"],
            completion_tokens=m["completion_tokens"],
            total_tokens=m["total_tokens"]
        )
    )


@router.get("/query/stream")
def query_stream(
    question: str,
    top_k: int = 4,
    temperature: float = 0.1,
    max_tokens: int = 1024
):
    """
    Server-Sent Events endpoint for streaming RAG responses.
    Event types: stage | chunks | token | done | error
    """
    _require_ready()

    def _sse(payload: dict) -> str:
        return f"data: {json.dumps(payload)}\n\n"

    def generate():
        try:
            # Stage 1: Embed query
            yield _sse({"type": "stage", "stage": "embedding", "label": "Embedding query…"})
            t_embed = time.perf_counter()
            query_embedding = embed_query(question, settings.embedding_model)
            embed_ms = round((time.perf_counter() - t_embed) * 1000, 1)
            yield _sse({"type": "stage", "stage": "retrieving",
                        "label": f"Searching ChromaDB… (embed={embed_ms}ms)"})

            # Stage 2: Retrieve
            result = retrieve(app_state.collection, query_embedding, top_k)
            chunks = result["chunks"]
            search_ms = result["search_latency_ms"]

            context = build_context(chunks)
            full_prompt = f"{SYSTEM_PROMPT}\n\nContext:\n{context}\n\nQuestion: {question}\n\nAnswer:"

            yield _sse({
                "type": "chunks",
                "chunks": chunks,
                "search_ms": search_ms,
                "embed_ms": embed_ms,
                "prompt_info": {
                    "system": SYSTEM_PROMPT,
                    "context": context,
                    "question": question,
                    "full_prompt": full_prompt
                }
            })

            if not chunks:
                yield _sse({"type": "done",
                            "answer": "No relevant context found in the document.",
                            "metrics": {}})
                return

            # Stage 3: Stream LLM tokens
            yield _sse({"type": "stage", "stage": "generating", "label": "Groq is generating…"})
            t_llm = time.perf_counter()
            full_answer = ""

            for token in stream_answer(question, chunks, settings.groq_model, temperature, max_tokens):
                full_answer += token
                yield _sse({"type": "token", "text": token})

            llm_ms = round((time.perf_counter() - t_llm) * 1000, 1)

            # Record metrics
            scores = [c["score"] for c in chunks]
            query_ms = embed_ms + search_ms
            app_state.record_retrieval(query_ms, search_ms, scores, top_k)
            app_state.record_llm(settings.groq_model, llm_ms, 0, 0)

            yield _sse({
                "type": "done",
                "answer": full_answer,
                "metrics": {
                    "embed_ms": embed_ms,
                    "search_ms": search_ms,
                    "llm_ms": llm_ms,
                    "total_ms": round(embed_ms + search_ms + llm_ms, 1)
                }
            })

        except Exception as exc:
            yield _sse({"type": "error", "message": str(exc)})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive"
        }
    )


@router.get("/metrics", response_model=AllMetrics)
def get_metrics():
    return app_state.metrics


