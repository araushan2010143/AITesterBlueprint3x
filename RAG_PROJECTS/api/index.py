"""
Vercel serverless FastAPI app — Pinecone backend, Mangum ASGI adapter.
All routes prefixed with /api/ to match Vercel rewrites.
Stateless: no in-memory state; Pinecone is the source of truth.
"""
import os
import sys
import time
from pathlib import Path
from typing import List

import fitz  # PyMuPDF
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from mangum import Mangum

# Make backend/ importable from api/index.py at project root
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from embeddings.embedder import embed_documents, embed_query
from ingestion.pdf_loader import chunk_documents
from llm.groq_llm import generate_answer, SYSTEM_PROMPT
from vectorstore.pinecone_store import (
    get_index, upsert_chunks, query_vectors, get_stats, delete_all_vectors
)

EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "nomic-embed-text-v1.5")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

app = FastAPI(title="RAG Explorer", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "healthy", "version": "2.0.0", "backend": "pinecone"}


@app.get("/api/status")
def get_status():
    try:
        index = get_index()
        stats = get_stats(index)
        count = stats["total_vectors"]
        is_ready = count > 0
        return {
            "status": "ready" if is_ready else "idle",
            "is_ready": is_ready,
            "progress": {
                "stage": "complete" if is_ready else "idle",
                "current": count,
                "total": count,
                "message": f"{count} vectors indexed in Pinecone" if is_ready
                           else "No documents indexed yet. Upload a PDF to get started.",
                "percent": 100.0 if is_ready else 0.0,
            },
            "error": None,
        }
    except Exception as exc:
        return {
            "status": "error",
            "is_ready": False,
            "progress": {
                "stage": "error", "current": 0, "total": 0,
                "message": str(exc), "percent": 0.0,
            },
            "error": str(exc),
        }


@app.post("/api/ingest")
async def ingest(
    file: UploadFile = File(...),
    chunk_size: int = Form(800),
    chunk_overlap: int = Form(150),
    rebuild: str = Form("false"),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    t_total = time.perf_counter()
    should_rebuild = rebuild.lower() in ("true", "1", "yes")

    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")

        pages = []
        for page_num in range(len(doc)):
            text = doc[page_num].get_text("text").strip()
            if text:
                pages.append({
                    "text": text,
                    "metadata": {
                        "filename": file.filename,
                        "page": page_num + 1,
                        "doc_id": Path(file.filename).stem,
                        "total_pages": len(doc),
                        "source": file.filename,
                    },
                })
        doc.close()

        if not pages:
            raise HTTPException(400, "No extractable text found in this PDF.")

        chunks = chunk_documents(pages, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        texts = [c["text"] for c in chunks]
        embeddings = embed_documents(texts, model=EMBEDDING_MODEL)

        display_ns = Path(file.filename).stem.lower().replace(" ", "_")[:50]
        namespace = ""  # default namespace; Pinecone queries without namespace search here
        index = get_index()

        if should_rebuild:
            delete_all_vectors(index, namespace=namespace)

        upsert_chunks(index, chunks, embeddings, namespace=namespace)

        return {
            "status": "complete",
            "documents_loaded": 1,
            "total_pages": len(pages),
            "total_chunks": len(chunks),
            "embeddings_created": len(embeddings),
            "time_taken_seconds": round(time.perf_counter() - t_total, 2),
            "collection_name": display_ns,
            "storage_path": "pinecone (serverless)",
            "chunk_size": chunk_size,
            "chunk_overlap": chunk_overlap,
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Ingest failed: {exc}")


@app.post("/api/reindex")
async def reindex(
    file: UploadFile = File(...),
    chunk_size: int = Form(800),
    chunk_overlap: int = Form(150),
):
    """Alias for ingest with rebuild=true — deletes existing vectors first."""
    return await ingest(file=file, chunk_size=chunk_size, chunk_overlap=chunk_overlap, rebuild="true")


@app.post("/api/query")
async def query(req: dict):
    question = (req.get("question") or "").strip()
    top_k = int(req.get("top_k", 4))
    temperature = float(req.get("temperature", 0.1))
    max_tokens = int(req.get("max_tokens", 1024))

    if not question:
        raise HTTPException(400, "question is required")

    try:
        index = get_index()
        stats = get_stats(index)
        if stats["total_vectors"] == 0:
            raise HTTPException(503, "No documents indexed. Upload and ingest a PDF first.")

        t_embed = time.perf_counter()
        query_embedding = embed_query(question, EMBEDDING_MODEL)
        embed_ms = round((time.perf_counter() - t_embed) * 1000, 1)

        t_search = time.perf_counter()
        chunks = query_vectors(index, query_embedding, top_k=top_k)
        search_ms = round((time.perf_counter() - t_search) * 1000, 1)

        if not chunks:
            return {
                "answer": "No relevant context found in the indexed documents for your question.",
                "sources": [],
                "prompt_used": {
                    "system": SYSTEM_PROMPT, "context": "",
                    "question": question, "full_prompt": "",
                },
                "metrics": {
                    "query_latency_ms": embed_ms, "search_latency_ms": search_ms,
                    "llm_response_time_ms": 0,
                    "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0,
                },
            }

        llm_result = generate_answer(
            question=question, chunks=chunks, model=GROQ_MODEL,
            temperature=temperature, max_tokens=max_tokens,
        )
        m = llm_result["metrics"]

        return {
            "answer": llm_result["answer"],
            "sources": chunks,
            "prompt_used": llm_result["prompt_info"],
            "metrics": {
                "query_latency_ms": round(embed_ms + search_ms, 1),
                "search_latency_ms": search_ms,
                "llm_response_time_ms": m["llm_response_time_ms"],
                "prompt_tokens": m["prompt_tokens"],
                "completion_tokens": m["completion_tokens"],
                "total_tokens": m["total_tokens"],
            },
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Query failed: {exc}")


@app.get("/api/documents")
def list_documents():
    try:
        index = get_index()
        stats = get_stats(index)
        docs = []
        for ns, ns_data in stats.get("namespaces", {}).items():
            count = ns_data.get("vector_count", 0) if isinstance(ns_data, dict) else 0
            docs.append({
                "id": ns,
                "filename": ns.replace("_", " ").title() + ".pdf",
                "pages": 0,
                "chunks_count": count,
            })
        if not docs and stats["total_vectors"] > 0:
            docs.append({
                "id": "default",
                "filename": "Indexed Document",
                "pages": 0,
                "chunks_count": stats["total_vectors"],
            })
        return docs
    except Exception:
        return []


@app.get("/api/chunks")
def list_chunks():
    return []


@app.get("/api/metrics")
def get_metrics():
    try:
        index = get_index()
        stats = get_stats(index)
        count = stats["total_vectors"]
        ns_count = len(stats.get("namespaces", {}))
    except Exception:
        count = 0
        ns_count = 0

    return {
        "document_metrics": {
            "total_documents": ns_count or (1 if count > 0 else 0),
            "total_pages": 0,
            "total_chunks": count,
            "avg_chunk_size": 652.0,
        },
        "embedding_metrics": {
            "model": EMBEDDING_MODEL,
            "dimension": 768,
            "time_taken_seconds": 0.0,
            "total_vectors": count,
        },
        "retrieval_metrics": {
            "top_k": 4,
            "avg_query_latency_ms": 0.0,
            "avg_search_latency_ms": 0.0,
            "avg_similarity_score": 0.0,
            "total_queries": 0,
        },
        "llm_metrics": {
            "model": GROQ_MODEL,
            "avg_response_time_ms": 0.0,
            "avg_prompt_tokens": 0.0,
            "avg_completion_tokens": 0.0,
            "total_requests": 0,
        },
    }


# ── Frontend SPA serving ──────────────────────────────────────────────────────
# frontend/dist/ is bundled with this function via vercel.json includeFiles.
DIST = Path(__file__).parent.parent / "frontend" / "dist"


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    """Serve React SPA static files; fall back to index.html for client-side routes."""
    # Guard: don't intercept API routes that somehow reach here
    if full_path.startswith("api/"):
        raise HTTPException(404, "Not Found")

    if DIST.is_dir():
        target = DIST / full_path
        if target.is_file():
            return FileResponse(str(target))

    index = DIST / "index.html"
    if index.is_file():
        return FileResponse(str(index))

    raise HTTPException(503, "Frontend build not found. Run: npm run vercel-build")


# Mangum adapts ASGI → Vercel/Lambda serverless invocation
handler = Mangum(app, lifespan="off")
