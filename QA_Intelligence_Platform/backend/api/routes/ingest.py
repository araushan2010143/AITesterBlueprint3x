"""Ingest endpoint — upload documents into the knowledge base."""
from __future__ import annotations
import os
import re
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Literal

router = APIRouter()

SourceType = Literal[
    "code", "pdf", "pptx", "markdown", "excel", "csv", "jira", "logs", "meeting_notes", "text"
]

# ── Extension classification ───────────────────────────────────────────────────
# Never allow these extensions into code collections (selenium/playwright/testcases)
_PRESENTATION_EXT = {"pptx", "ppt", "pps", "ppsx", "key", "odp"}
_SPREADSHEET_EXT  = {"xlsx", "xls", "ods", "numbers", "csv", "tsv"}
_DOCUMENT_EXT     = {
    "pdf", "docx", "doc", "odt", "rtf",
    "md", "mdx", "markdown",
    "txt", "text",
    "html", "htm",              # HTML docs / test reports → company_docs
    "rst",                      # reStructuredText docs
    "adoc",                     # AsciiDoc
}
_EMAIL_EXT        = {"eml", "msg", "mbox"}
_CONFIG_EXT       = {
    "json", "yaml", "yml", "toml", "ini", "cfg", "conf",
    "xml", "properties", "env",
}
_LOG_EXT          = {"log", "out", "gz"}   # .gz is almost always a log archive
_CODE_EXT         = {
    # JVM
    "java", "kt", "groovy", "scala",
    # Python
    "py", "pyw", "ipynb",
    # JavaScript / TypeScript
    "js", "jsx", "ts", "tsx", "mjs", "cjs",
    # Go, Rust, C/C++
    "go", "rs", "c", "cpp", "cc", "cxx", "h", "hpp",
    # .NET
    "cs", "vb", "fs",
    # Ruby, PHP, Swift, Kotlin
    "rb", "php", "swift",
    # Shell
    "sh", "bash", "zsh", "ps1", "bat", "cmd",
    # SQL
    "sql",
    # Other
    "r", "m", "dart", "lua",
}
_CODE_COLLECTIONS = {"selenium", "playwright", "testcases"}


def resolve_collection(filename: str, source_type: str, requested: str) -> str:
    """
    Authoritative backend collection routing — single source of truth.
    Priority:
      1. Filename keywords   (strongest — explicit intent)
      2. File extension      (structural rule — never wrong)
      3. Source-type hint    (client-declared type)
      4. Client request      (fallback — trust the user for ambiguous cases)

    The frontend suggestion is a UX hint only; this function is the authority.
    """
    f   = filename.lower()
    ext = f.rsplit(".", 1)[-1] if "." in f else ""

    # ── 1. Filename keywords ───────────────────────────────────────────────────
    if re.search(r"\bselenium\b",                              f): return "selenium"
    if re.search(r"\bplaywright\b",                            f): return "playwright"
    if re.search(r"test.?case|testcase|tc[-_]\d",              f): return "testcases"
    if re.search(r"\bjira\b|ticket[-_]\d|kan[-_]\d|issue[-_]\d",f): return "jira"
    if re.search(r"meeting|standup|retro|1on1|sprint.?plan",   f): return "meeting_notes"
    if re.search(r"\bprd\b|\bbrd\b|\bsrs\b|\bfrd\b|requirement",f): return "prd"
    if re.search(r"jenkins|build.?log|console.?log|pipeline",  f): return "logs"
    if re.search(r"company|policy|onboard|handbook|runbook",   f): return "company_docs"

    # ── 2. Extension rules ─────────────────────────────────────────────────────

    # Presentations → always company_docs, never a code collection
    if ext in _PRESENTATION_EXT:
        return "company_docs"

    # Spreadsheets → company_docs (may contain test cases, but name keyword handles that)
    if ext in _SPREADSHEET_EXT:
        return "company_docs"

    # Email files → meeting_notes (closest semantic fit)
    if ext in _EMAIL_EXT:
        return "meeting_notes"

    # Log files → logs
    if ext in _LOG_EXT:
        return "logs"

    # Code files → trust user's collection if it's a code collection, else pass through
    if ext in _CODE_EXT or source_type == "code":
        return requested if requested in _CODE_COLLECTIONS else requested

    # Config / data / markup files (JSON, YAML, XML, HTML …)
    # Default company_docs. Allow a code collection ONLY when the filename
    # signals test data (fixture / mock / testdata / schema / spec / contract).
    if ext in _CONFIG_EXT:
        _test_data_hint = re.search(
            r"fixture|mock|stub|testdata|test.?data|schema|spec|contract|swagger|openapi|postman",
            f,
        )
        if requested in _CODE_COLLECTIONS and _test_data_hint:
            return requested  # e.g. fixtures.json → selenium (user intent is clear)
        return "company_docs"  # safe default for all other json/yaml/xml/html

    # Document types → company_docs unless user explicitly put it in a specific collection
    if ext in _DOCUMENT_EXT:
        return "company_docs" if requested in _CODE_COLLECTIONS else requested

    # ── 3. Source-type hints ───────────────────────────────────────────────────
    _source_map: dict[str, str] = {
        "logs":          "logs",
        "meeting_notes": "meeting_notes",
        "jira":          "jira",
        "csv":           "company_docs",
        "excel":         "company_docs",
        "pdf":           "company_docs",
        "pptx":          "company_docs",
        "markdown":      "company_docs",
    }
    if source_type in _source_map:
        return _source_map[source_type]

    # ── 4. Fall back to client request ────────────────────────────────────────
    return requested


class IngestResponse(BaseModel):
    indexed: int
    skipped: int
    collection: str
    filename: str
    collection_resolved: bool  # true when backend overrode the client's suggestion


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
    The backend resolves the final collection via strict business rules —
    the client's `collection` field is a hint, not authoritative.
    """
    from config import get_settings
    from pipeline.chunker import chunk_document
    from pipeline.indexer import Indexer

    s = get_settings()
    upload_dir = s.upload_dir
    os.makedirs(upload_dir, exist_ok=True)

    filename = file.filename or "upload.bin"
    path = os.path.join(upload_dir, filename)
    content = await file.read()
    with open(path, "wb") as f:
        f.write(content)

    # Resolve collection — backend is authoritative
    final_collection = resolve_collection(filename, source_type, collection)
    collection_resolved = final_collection != collection

    # Auto-detect source_type from extension when client sends "text"
    if source_type == "text":
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext in _PRESENTATION_EXT:
            source_type = "pptx"
        elif ext in _CODE_EXT:
            source_type = "code"
        elif ext == "pdf":
            source_type = "pdf"
        elif ext in ("md", "mdx"):
            source_type = "markdown"
        elif ext in _LOG_EXT:
            source_type = "logs"
        elif ext in ("csv",):
            source_type = "csv"

    text = _read_text(path, source_type)
    base_metadata = {
        "filename": filename,
        "path":     path,
        "repo":     repo,
        "framework": framework,
        "module":   module,
        "feature":  feature,
        "sprint":   sprint,
    }

    chunks = chunk_document(text, source_type, base_metadata)
    try:
        result = Indexer().index(chunks, final_collection)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")

    return IngestResponse(
        indexed=result["indexed"],
        skipped=result["skipped"],
        collection=result["collection"],
        filename=filename,
        collection_resolved=collection_resolved,
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
    return IngestResponse(**result, filename=issue_key, collection_resolved=False)


def _read_text(path: str, source_type: str) -> str:
    if source_type == "pdf":
        from pipeline.parsers.pdf_parser import parse_pdf
        text, _ = parse_pdf(path)
        return text
    if source_type == "pptx":
        from pipeline.parsers.pptx_parser import parse_pptx
        text, _ = parse_pptx(path)
        return text
    if source_type == "code":
        from pipeline.parsers.code_parser import parse_code_file
        text, _ = parse_code_file(path)
        return text
    if source_type == "markdown":
        from pipeline.parsers.markdown_parser import parse_markdown
        text, _ = parse_markdown(path)
        return text
    if source_type == "logs":
        from pipeline.parsers.log_parser import parse_log
        text, _ = parse_log(path)
        return text
    # csv / excel / text / meeting_notes
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()
