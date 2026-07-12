import os
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, File, Form, UploadFile, HTTPException, BackgroundTasks, Depends
from sqlmodel import Session, select
from backend.database.db import Document, Chunk, get_session
from backend.parsers.dispatcher import parse_file, SUPPORTED_EXTENSIONS
from backend.ingestion.chunker import chunk_pages
from backend.ingestion.metadata_extractor import extract_metadata
from backend.embeddings.mistral_embedder import embed_texts
from backend.vectorstore import pinecone_store
from backend.retrieval.hybrid_search import invalidate_bm25
from backend.config import get_settings
import datetime

router = APIRouter(prefix="/api/ingest", tags=["Ingestion"])
settings = get_settings()


@router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    chunk_size: int = Form(1000),
    chunk_overlap: int = Form(200),
    chunk_strategy: str = Form("recursive"),
    session: Session = Depends(get_session),
):
    ext = Path(file.filename).suffix.lower().lstrip(".")
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type: .{ext}. Supported: {SUPPORTED_EXTENSIONS}")

    content = await file.read()
    doc_id = str(uuid.uuid4())
    upload_path = Path(settings.upload_dir) / doc_id
    upload_path.mkdir(parents=True, exist_ok=True)
    file_path = upload_path / file.filename

    with open(file_path, "wb") as f:
        f.write(content)

    doc = Document(
        id=doc_id,
        filename=file.filename,
        file_type=ext,
        file_size=len(content),
        status="processing",
        namespace=doc_id,
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)

    background_tasks.add_task(
        _process_document,
        doc_id=doc_id,
        file_path=str(file_path),
        filename=file.filename,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        chunk_strategy=chunk_strategy,
    )

    return {"doc_id": doc_id, "filename": file.filename, "status": "processing"}


def _process_document(
    doc_id: str, file_path: str, filename: str,
    chunk_size: int, chunk_overlap: int, chunk_strategy: str,
):
    from sqlmodel import Session
    from backend.database.db import engine

    with Session(engine) as session:
        doc = session.get(Document, doc_id)
        if not doc:
            return

        try:
            # 1. Parse
            pages = parse_file(file_path, filename)
            if not pages:
                raise ValueError("No extractable text found in this file.")

            # 2. Extract metadata from first 2000 chars
            sample_text = " ".join(p["text"] for p in pages[:3])
            meta = extract_metadata(sample_text)
            doc.document_type = meta.get("document_type")
            doc.module = meta.get("module")
            doc.feature = meta.get("feature")
            doc.priority = meta.get("priority")
            doc.author = meta.get("author")
            doc.release = meta.get("release")
            doc.tags = ", ".join(meta.get("tags", []) or [])
            doc.automation_status = meta.get("automation_status")
            doc.total_pages = len(pages)

            # 3. Chunk
            chunks = chunk_pages(pages, chunk_size=chunk_size, chunk_overlap=chunk_overlap, strategy=chunk_strategy)
            doc.total_chunks = len(chunks)

            # 4. Embed
            texts = [c["text"] for c in chunks]
            embeddings = embed_texts(texts)

            # 5. Enrich chunk metadata with doc-level metadata
            for chunk in chunks:
                chunk["metadata"].update({
                    "doc_id": doc_id,
                    "filename": filename,
                    "document_type": doc.document_type or "general",
                    "module": doc.module or "",
                    "feature": doc.feature or "",
                    "priority": doc.priority or "",
                    "author": doc.author or "",
                    "release": doc.release or "",
                    "automation_status": doc.automation_status or "",
                })

            # 6. Upsert to Pinecone
            n_vectors = pinecone_store.upsert(chunks, embeddings, namespace=doc_id)
            doc.total_vectors = n_vectors

            # 7. Save chunks to SQLite for BM25
            for c in chunks:
                chunk_record = Chunk(
                    id=c["id"],
                    doc_id=doc_id,
                    chunk_index=c["chunk_index"],
                    text=c["text"],
                    page=c["page"],
                    chunk_strategy=chunk_strategy,
                )
                session.add(chunk_record)

            doc.status = "ready"
            doc.updated_at = datetime.datetime.utcnow()
            session.add(doc)
            session.commit()
            invalidate_bm25()

        except Exception as exc:
            doc.status = "error"
            doc.error = str(exc)[:500]
            doc.updated_at = datetime.datetime.utcnow()
            session.add(doc)
            session.commit()


@router.delete("/{doc_id}")
def delete_document(doc_id: str, session: Session = Depends(get_session)):
    doc = session.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")

    # Delete from Pinecone
    pinecone_store.delete_namespace(doc_id)

    # Delete chunks from SQLite
    chunks = session.exec(select(Chunk).where(Chunk.doc_id == doc_id)).all()
    for c in chunks:
        session.delete(c)

    session.delete(doc)
    session.commit()
    invalidate_bm25()

    # Clean up uploaded file
    upload_path = Path(settings.upload_dir) / doc_id
    if upload_path.exists():
        import shutil
        shutil.rmtree(upload_path, ignore_errors=True)

    return {"status": "deleted", "doc_id": doc_id}
