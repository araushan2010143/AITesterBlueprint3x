"""Ingest endpoint — upload documents into the knowledge base."""
from __future__ import annotations
import os
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Literal

router = APIRouter()

SourceType = Literal["code", "pdf", "markdown", "excel", "csv", "jira", "logs", "meeting_notes", "text"]


class IngestResponse(BaseModel):
    indexed: int
    skipped: int
    collection: str
    filename: str


@router.post("/file", response_model=IngestResponse)
async def ingest_file(
    file: UploadFile = File(...),
    collection: str  = Form(...),
    source_type: SourceType = Form("text"),
    repo: str        = Form(""),
    framework: str   = Form(""),
    module: str      = Form(""),
    feature: str     = Form(""),
    sprint: str      = Form(""),
):
    """
    Upload a file and index it into a Qdrant collection.
    Source-specific chunking is applied automatically.
    Incremental indexing skips unchanged chunks (SHA256).
    """
    from config import get_settings
    from pipeline.chunker import chunk_document
    from pipeline.indexer import Indexer

    s = get_settings()
    upload_dir = s.upload_dir
    os.makedirs(upload_dir, exist_ok=True)

    path = os.path.join(upload_dir, file.filename or "upload.bin")
    content = await file.read()
    with open(path, "wb") as f:
        f.write(content)

    text = _read_text(path, source_type)
    base_metadata = {
        "filename": file.filename,
        "path":     path,
        "repo":     repo,
        "framework": framework,
        "module":   module,
        "feature":  feature,
        "sprint":   sprint,
    }

    chunks = chunk_document(text, source_type, base_metadata)
    result = Indexer().index(chunks, collection)

    return IngestResponse(
        indexed=result["indexed"],
        skipped=result["skipped"],
        collection=result["collection"],
        filename=file.filename or "",
    )


@router.post("/jira/{issue_key}", response_model=IngestResponse)
def ingest_jira(issue_key: str):
    """Fetch a JIRA issue and index it into the 'jira' collection."""
    from pipeline.parsers.jira_parser import parse_jira_issue
    from pipeline.chunker import chunk_document
    from pipeline.indexer import Indexer

    text, metadata = parse_jira_issue(issue_key)
    chunks = chunk_document(text, "jira", metadata)
    result = Indexer().index(chunks, "jira")
    return IngestResponse(**result, filename=issue_key)


def _read_text(path: str, source_type: str) -> str:
    if source_type == "pdf":
        from pipeline.parsers.pdf_parser import parse_pdf
        text, _ = parse_pdf(path)
        return text
    elif source_type == "code":
        from pipeline.parsers.code_parser import parse_code_file
        text, _ = parse_code_file(path)
        return text
    elif source_type == "markdown":
        from pipeline.parsers.markdown_parser import parse_markdown
        text, _ = parse_markdown(path)
        return text
    elif source_type == "logs":
        from pipeline.parsers.log_parser import parse_log
        text, _ = parse_log(path)
        return text
    else:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
