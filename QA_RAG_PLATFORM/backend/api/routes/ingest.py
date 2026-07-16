import json
import os
import uuid
from pathlib import Path
from typing import Any, Dict, Optional
from fastapi import APIRouter, File, Form, UploadFile, HTTPException, BackgroundTasks, Depends
from sqlmodel import Session, select
from backend.database.db import Document, Chunk, get_session
from backend.parsers.dispatcher import parse_file, SUPPORTED_EXTENSIONS
from backend.ingestion.chunker import chunk_pages
from backend.ingestion.metadata_extractor import extract_metadata
from backend.embeddings.mistral_embedder import embed_texts
from backend.vectorstore import upsert as _vs_upsert, delete_by_doc_id as _vs_delete
from backend.retrieval.hybrid_search import invalidate_bm25
from backend.services.pii_scanner import scan_and_redact, scan_filename, findings_to_log
from backend.services.virus_scan import scan_file as virus_scan_file, is_enabled as virus_scan_enabled
from backend.services.dedup_service import deduplicate
from backend.config import get_settings
import datetime
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ingest", tags=["Ingestion"])
settings = get_settings()


@router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    chunk_size: int = Form(1000),
    chunk_overlap: int = Form(200),
    chunk_strategy: str = Form("recursive"),
    team_id: Optional[str] = Form(None),
    session: Session = Depends(get_session),
):
    ext = Path(file.filename).suffix.lower().lstrip(".")
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type: .{ext}. Supported: {SUPPORTED_EXTENSIONS}")

    # Flag suspicious filenames before any processing
    suspicious = scan_filename(file.filename)
    if suspicious:
        logger.warning("Suspicious filename keywords detected: %s in %s", suspicious, file.filename)

    content = await file.read()
    doc_id = str(uuid.uuid4())
    upload_path = Path(settings.upload_dir) / doc_id
    upload_path.mkdir(parents=True, exist_ok=True)
    file_path = upload_path / file.filename

    with open(file_path, "wb") as f:
        f.write(content)

    # Virus scan before any processing (optional — no-op when ClamAV not configured)
    if virus_scan_enabled():
        vscan = virus_scan_file(str(file_path))
        if not vscan.clean:
            import shutil
            shutil.rmtree(upload_path, ignore_errors=True)
            raise HTTPException(
                400,
                f"Upload rejected: virus/malware detected ({vscan.threat_name}). "
                f"Scan method: {vscan.scan_method}."
            )

    doc = Document(
        id=doc_id,
        filename=file.filename,
        file_type=ext,
        file_size=len(content),
        status="processing",
        namespace=doc_id,
        team_id=team_id,
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
        team_id=team_id,
    )

    return {
        "doc_id": doc_id,
        "filename": file.filename,
        "status": "processing",
        "filename_warnings": suspicious,
    }


def _process_document(
    doc_id: str, file_path: str, filename: str,
    chunk_size: int, chunk_overlap: int, chunk_strategy: str,
    team_id: Optional[str] = None,
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

            # 2. PII + Secret scan on raw text BEFORE any AI processing
            full_text = " ".join(p["text"] for p in pages)
            redact_pii = settings.pii_action == "redact"
            scan_result = scan_and_redact(
                full_text,
                redact_secrets=(settings.secret_action in ("redact", "block")),
                redact_pii=redact_pii,
            )
            # Block upload if policy requires it
            if scan_result.has_secrets and settings.secret_action == "block":
                raise ValueError(
                    f"Upload blocked: {sum(1 for f in scan_result.findings if f.type == 'SECRET')} "
                    f"secret(s) detected. Remove secrets before uploading."
                )
            if scan_result.has_pii and settings.pii_action == "block":
                raise ValueError(
                    f"Upload blocked: {sum(1 for f in scan_result.findings if f.type == 'PII')} "
                    f"PII element(s) detected. Remove PII before uploading."
                )
            # Store scan summary on document record for audit log
            doc.pii_summary = json.dumps(scan_result.summary())
            # Propagate redacted text back into pages for chunking
            if scan_result.redacted_count > 0 and (redact_pii or settings.secret_action == "redact"):
                # Rebuild pages with redacted text (proportional split by original page length)
                clean = scan_result.clean_text
                total_len = len(full_text) or 1
                pos = 0
                for p in pages:
                    original_len = len(p["text"])
                    share = int(len(clean) * original_len / total_len)
                    p["text"] = clean[pos:pos + share]
                    pos += share

            # 3. Extract metadata from first 2000 chars
            sample_text = " ".join(p["text"] for p in pages[:3])
            meta = extract_metadata(sample_text)
            doc.document_type = meta.get("document_type")
            doc.feature = meta.get("feature")
            doc.priority = meta.get("priority")
            doc.author = meta.get("author")
            doc.release = meta.get("release")
            doc.tags = ", ".join(meta.get("tags", []) or [])
            doc.automation_status = meta.get("automation_status")
            doc.total_pages = len(pages)

            # For columnar files (CSV/Excel) use the catalog of ALL unique values
            # so filter dropdowns show every module/author/etc. in the file
            catalog = pages[0].get("metadata", {}).get("_catalog") if pages else None
            if catalog and catalog.get("modules"):
                doc.module = ", ".join(catalog["modules"])
                if not doc.author and catalog.get("authors"):
                    doc.author = ", ".join(catalog["authors"])
                if not doc.release and catalog.get("releases"):
                    doc.release = ", ".join(catalog["releases"])
                if not doc.automation_status and catalog.get("automation_statuses"):
                    doc.automation_status = ", ".join(catalog["automation_statuses"])
            else:
                doc.module = meta.get("module")

            # 4. Chunk
            chunks = chunk_pages(pages, chunk_size=chunk_size, chunk_overlap=chunk_overlap, strategy=chunk_strategy)
            doc.total_chunks = len(chunks)

            # 5. Embed
            texts = [c["text"] for c in chunks]
            embeddings = embed_texts(texts)

            # 6. Enrich chunk metadata with doc-level metadata + team_id for auth-scoped retrieval
            # (enrichment must happen before dedup so metadata is present on kept chunks)
            for chunk in chunks:
                existing = chunk.get("metadata", {})
                chunk["metadata"].update({
                    "doc_id": doc_id,
                    "filename": filename,
                    "document_type": existing.get("document_type") or doc.document_type or "general",
                    "module": existing.get("module") or (doc.module or "").split(",")[0].strip(),
                    "feature": existing.get("feature") or doc.feature or "",
                    "priority": existing.get("priority") or doc.priority or "",
                    "author": existing.get("author") or (doc.author or "").split(",")[0].strip(),
                    "release": existing.get("release") or (doc.release or "").split(",")[0].strip(),
                    "automation_status": existing.get("automation_status") or (doc.automation_status or "").split(",")[0].strip(),
                    # team_id enables authorization-scoped Pinecone retrieval
                    "team_id": team_id or "",
                    "connector_type": existing.get("connector_type", "upload"),
                })

            # 7. Dedup: skip exact and near-duplicate chunks before Pinecone upsert
            chunks, embeddings, skipped = deduplicate(chunks, embeddings)
            if skipped:
                logger.info("Dedup: skipped %d duplicate chunks for doc %s", skipped, doc_id)

            # 8. Upsert to Pinecone (default namespace so cross-doc search works)
            n_vectors = _vs_upsert(chunks, embeddings, namespace="")
            doc.total_vectors = n_vectors

            # 9. Save chunks to SQLite for BM25
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

            logger.info(
                "Ingested doc %s (%s): %d chunks, %d vectors. PII: %s",
                doc_id, filename, len(chunks), n_vectors, doc.pii_summary,
            )

        except Exception as exc:
            doc.status = "error"
            doc.error = str(exc)[:500]
            doc.updated_at = datetime.datetime.utcnow()
            session.add(doc)
            session.commit()
            logger.error("Ingest error for %s: %s", doc_id, exc)


def _ingest_text_document(
    text: str,
    filename: str,
    extra_metadata: Dict[str, Any],
    db: Session,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> str:
    """
    Ingest plain text directly (used by connector sync, no file upload).
    Returns doc_id.
    """
    from backend.database.db import engine
    from sqlmodel import Session as _Session

    doc_id = str(uuid.uuid4())
    team_id = extra_metadata.get("team_id", "")

    # PII scan
    redact_pii = settings.pii_action == "redact"
    scan_result = scan_and_redact(text, redact_secrets=True, redact_pii=redact_pii)
    if scan_result.redacted_count > 0:
        text = scan_result.clean_text

    # Wrap as single page for the chunker
    pages = [{"text": text, "page": 1, "metadata": extra_metadata}]
    chunks = chunk_pages(pages, chunk_size=chunk_size, chunk_overlap=chunk_overlap)

    if not chunks:
        return doc_id

    embeddings = embed_texts([c["text"] for c in chunks])

    for chunk in chunks:
        chunk["metadata"].update({
            "doc_id": doc_id,
            "filename": filename,
            "team_id": team_id,
            **extra_metadata,
        })

    # Dedup before upsert
    chunks, embeddings, _ = deduplicate(chunks, embeddings)

    n_vectors = _vs_upsert(chunks, embeddings, namespace="")

    doc = Document(
        id=doc_id,
        filename=filename,
        file_type="txt",
        file_size=len(text.encode()),
        status="ready",
        total_pages=1,
        total_chunks=len(chunks),
        total_vectors=n_vectors,
        team_id=team_id or None,
        pii_summary=json.dumps(scan_result.summary()),
    )
    db.add(doc)

    for c in chunks:
        db.add(Chunk(
            id=c["id"],
            doc_id=doc_id,
            chunk_index=c["chunk_index"],
            text=c["text"],
            page=c.get("page", 1),
        ))

    db.commit()
    invalidate_bm25()
    return doc_id


@router.post("/openapi")
async def ingest_openapi(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    team_id: Optional[str] = Form(None),
    populate_graph: bool = Form(False),
    session: Session = Depends(get_session),
):
    """
    Dedicated OpenAPI ingestion endpoint.
    Accepts .yaml, .yml, or .json files containing OpenAPI 3.x / Swagger 2.0 specs.
    Set populate_graph=true to also upsert APIEndpoint nodes into Neo4j.
    """
    ext = Path(file.filename).suffix.lower().lstrip(".")
    if ext not in {"yaml", "yml", "json"}:
        raise HTTPException(400, f"OpenAPI ingest accepts .yaml, .yml, or .json files; got .{ext}")

    content = await file.read()

    from backend.parsers.openapi_parser import is_openapi
    if not is_openapi(content):
        raise HTTPException(400, "File does not appear to be a valid OpenAPI/Swagger specification.")

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
        team_id=team_id,
        document_type="api_docs",
    )
    session.add(doc)
    session.commit()

    background_tasks.add_task(
        _process_document,
        doc_id=doc_id,
        file_path=str(file_path),
        filename=file.filename,
        chunk_size=1000,
        chunk_overlap=100,
        chunk_strategy="recursive",
        team_id=team_id,
    )

    graph_count = 0
    if populate_graph:
        from backend.parsers.openapi_parser import populate_graph as _populate_graph
        graph_count = _populate_graph(content, file.filename, team_id=team_id or "")

    return {
        "doc_id": doc_id,
        "filename": file.filename,
        "status": "processing",
        "graph_endpoints_upserted": graph_count,
    }


@router.delete("/{doc_id}")
def delete_document(doc_id: str, session: Session = Depends(get_session)):
    doc = session.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")

    # Delete from Pinecone by doc_id metadata filter
    _vs_delete(doc_id)

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
