"""
Hourly auto-ingester — watches data/ folder, detects new/modified files,
re-indexes changed content into the correct Qdrant collection.

Change detection: file mtime + size stored in SQLite.
Modified file:   delete old Qdrant points by filename, re-index.
New file:        index directly.
Unchanged file:  skip (no embedding cost).
"""
from __future__ import annotations
import os
import sqlite3
import time
import logging
from datetime import datetime, timezone
from typing import TypedDict

log = logging.getLogger("auto_ingester")

# ── Folder → Qdrant collection ───────────────────────────────────────────────
FOLDER_COLLECTION: dict[str, str] = {
    "selenium":         "selenium",
    "playwright":       "playwright",
    "jira tickets":     "jira",
    "test_cases":       "testcases",
    "prd_srs_brd_frd":  "prd",
    "jenkins_logs":     "logs",
    "meeting notes":    "meeting_notes",
    "company_docs":     "company_docs",
    "figma designs":    "company_docs",
    "lucid charts":     "company_docs",
    "glossary":         "glossary",
}

# ── Extension → source type ──────────────────────────────────────────────────
EXT_SOURCE: dict[str, str] = {
    ".py": "code", ".java": "code", ".ts": "code", ".tsx": "code",
    ".js": "code", ".go": "code", ".cs": "code", ".rb": "code",
    ".pdf": "pdf",
    ".md": "markdown", ".mdx": "markdown",
    ".csv": "csv",
    ".log": "logs", ".out": "logs",
    ".txt": "text", ".xml": "text", ".json": "text",
    ".yaml": "text", ".yml": "text", ".properties": "text",
}

SKIP_NAMES    = {".DS_Store", ".gitignore", "Thumbs.db"}
SKIP_PREFIXES = ("readme", "readme (")
SKIP_EXTS     = {".snapshot", ".db", ".bin"}

# ── Run state shared with API ─────────────────────────────────────────────────
_state: dict = {
    "last_run":     None,   # ISO string
    "next_run":     None,   # ISO string
    "last_result":  None,   # dict
    "running":      False,
    "total_runs":   0,
}


def get_state() -> dict:
    return dict(_state)


# ── File registry (mtime + size tracking) ─────────────────────────────────────
_REG_DB = os.getenv("FILE_REGISTRY_DB", "./file_registry.db")


def _reg_conn() -> sqlite3.Connection:
    con = sqlite3.connect(_REG_DB)
    con.execute(
        "CREATE TABLE IF NOT EXISTS file_registry "
        "(path TEXT PRIMARY KEY, mtime REAL, size INTEGER, collection TEXT)"
    )
    con.commit()
    return con


def _load_file_registry() -> dict[str, tuple[float, int, str]]:
    with _reg_conn() as con:
        rows = con.execute("SELECT path, mtime, size, collection FROM file_registry").fetchall()
    return {r[0]: (r[1], r[2], r[3]) for r in rows}


def _save_file_entry(path: str, mtime: float, size: int, collection: str) -> None:
    with _reg_conn() as con:
        con.execute(
            "INSERT OR REPLACE INTO file_registry VALUES (?, ?, ?, ?)",
            (path, mtime, size, collection),
        )
        con.commit()


def _delete_file_entry(path: str) -> None:
    with _reg_conn() as con:
        con.execute("DELETE FROM file_registry WHERE path = ?", (path,))
        con.commit()


# ── Qdrant delete by filename ─────────────────────────────────────────────────
def _delete_qdrant_points(collection: str, filename: str) -> int:
    from database.qdrant_client import get_qdrant_client
    from qdrant_client.models import Filter, FieldCondition, MatchValue
    client = get_qdrant_client()
    try:
        before = client.count(collection).count
        client.delete(collection, points_selector=Filter(
            must=[FieldCondition(key="filename", match=MatchValue(value=filename))]
        ))
        after = client.count(collection).count
        return before - after
    except Exception:
        return 0


# ── Core scan + index ─────────────────────────────────────────────────────────
class RunResult(TypedDict):
    started_at: str
    finished_at: str
    files_checked: int
    files_new: int
    files_modified: int
    files_unchanged: int
    chunks_indexed: int
    chunks_skipped: int
    errors: list[str]


def run_once(data_dir: str | None = None) -> RunResult:
    """
    Scan data/ folder, detect changes, index only new/modified files.
    Safe to call while uvicorn is running (Qdrant lock held by the server process).
    Must be called from within the server process.
    """
    if data_dir is None:
        here = os.path.dirname(os.path.abspath(__file__))          # backend/services/
        root = os.path.dirname(os.path.dirname(os.path.dirname(here)))  # QA_Intelligence_Platform/
        data_dir = os.path.join(root, "data")

    result: RunResult = {
        "started_at":     datetime.now(timezone.utc).isoformat(),
        "finished_at":    "",
        "files_checked":  0,
        "files_new":      0,
        "files_modified": 0,
        "files_unchanged": 0,
        "chunks_indexed": 0,
        "chunks_skipped": 0,
        "errors":         [],
    }

    if not os.path.isdir(data_dir):
        result["errors"].append(f"data/ folder not found: {data_dir}")
        result["finished_at"] = datetime.now(timezone.utc).isoformat()
        return result

    registry = _load_file_registry()

    from pipeline.chunker import chunk_document
    from pipeline.indexer import Indexer
    from api.routes.ingest import _read_text
    from config import get_settings

    s = get_settings()
    os.makedirs(s.upload_dir, exist_ok=True)
    indexer = Indexer()

    for folder_name, collection in FOLDER_COLLECTION.items():
        folder_path = os.path.join(data_dir, folder_name)
        if not os.path.isdir(folder_path):
            continue

        for fname in os.listdir(folder_path):
            if fname in SKIP_NAMES:
                continue
            if any(fname.lower().startswith(p) for p in SKIP_PREFIXES):
                continue
            ext = os.path.splitext(fname)[1].lower()
            if ext in SKIP_EXTS or not ext:
                continue
            source_type = EXT_SOURCE.get(ext)
            if source_type is None:
                continue

            filepath = os.path.join(folder_path, fname)
            result["files_checked"] += 1

            try:
                stat  = os.stat(filepath)
                mtime = stat.st_mtime
                size  = stat.st_size

                prev = registry.get(filepath)
                is_new      = prev is None
                is_modified = (not is_new) and (prev[0] != mtime or prev[1] != size)

                if not is_new and not is_modified:
                    result["files_unchanged"] += 1
                    continue

                if is_modified:
                    removed = _delete_qdrant_points(collection, fname)
                    log.info("Modified %s — removed %d old points from %s", fname, removed, collection)
                    result["files_modified"] += 1
                else:
                    result["files_new"] += 1

                # Copy to uploads dir
                dest = os.path.join(s.upload_dir, fname)
                with open(filepath, "rb") as f:
                    raw = f.read()
                with open(dest, "wb") as f:
                    f.write(raw)

                text   = _read_text(dest, source_type)
                meta   = {"filename": fname, "path": filepath, "source": collection}
                chunks = chunk_document(text, source_type, meta)
                res    = indexer.index(chunks, collection)

                result["chunks_indexed"] += res.get("indexed", 0)
                result["chunks_skipped"] += res.get("skipped", 0)

                _save_file_entry(filepath, mtime, size, collection)
                log.info("Indexed %s → %s (+%d chunks)", fname, collection, res.get("indexed", 0))

            except Exception as exc:
                msg = f"{fname}: {exc}"
                result["errors"].append(msg)
                log.error("Auto-ingest error — %s", msg)

    result["finished_at"] = datetime.now(timezone.utc).isoformat()
    return result
