"""
Bulk-index everything in QA_Intelligence_Platform/data/ into Qdrant.

Folder → Collection mapping:
  data/selenium/            → selenium
  data/playwright/          → playwright
  data/jira tickets/        → jira
  data/test_cases/          → testcases
  data/prd_srs_brd_frd/     → prd
  data/jenkins_logs/        → logs
  data/meeting notes/       → meeting_notes
  data/company_docs/        → company_docs
  data/figma designs/       → company_docs
  data/lucid charts/        → company_docs
  data/glossary/            → glossary

Usage (from backend/):
    source .venv/bin/activate
    python scripts/index_data_folder.py

Options:
    --dry-run    Show what would be indexed without actually doing it
    --collection prd   Only index files mapped to this collection
    --force      Clear SHA256 registry before indexing (re-index everything)
"""
from __future__ import annotations
import argparse
import os
import sys

# ── Extension → source_type ──────────────────────────────────────────────────
EXT_SOURCE_TYPE: dict[str, str] = {
    ".py": "code", ".java": "code", ".ts": "code", ".tsx": "code",
    ".js": "code", ".go": "code", ".cs": "code", ".rb": "code",
    ".pdf": "pdf",
    ".md": "markdown", ".mdx": "markdown",
    ".csv": "csv",
    ".log": "logs", ".out": "logs",
    ".txt": "text", ".xml": "text", ".json": "text",
    ".yaml": "text", ".yml": "text", ".properties": "text",
}

# ── Folder name → Qdrant collection ──────────────────────────────────────────
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

SKIP_FILES = {".DS_Store", ".gitignore", "Thumbs.db"}
SKIP_EXTS  = {".snapshot", ".db", ".bin"}
SKIP_NAME_PATTERNS = ("readme", "readme (")  # placeholder files


def resolve_data_dir() -> str:
    here = os.path.dirname(os.path.abspath(__file__))          # backend/scripts/
    root = os.path.dirname(os.path.dirname(here))              # QA_Intelligence_Platform/
    return os.path.join(root, "data")


def collect_files(data_dir: str, only_collection: str | None) -> list[tuple[str, str, str]]:
    """Return list of (filepath, collection, source_type) for every indexable file."""
    found: list[tuple[str, str, str]] = []

    for folder_name, collection in FOLDER_COLLECTION.items():
        if only_collection and collection != only_collection:
            continue

        folder_path = os.path.join(data_dir, folder_name)
        if not os.path.isdir(folder_path):
            continue

        for fname in os.listdir(folder_path):
            if fname in SKIP_FILES:
                continue
            if any(fname.lower().startswith(p) for p in SKIP_NAME_PATTERNS):
                continue
            ext = os.path.splitext(fname)[1].lower()
            if ext in SKIP_EXTS or not ext:
                continue

            source_type = EXT_SOURCE_TYPE.get(ext)
            if source_type is None:
                print(f"  ⚠  Skipping unknown extension: {fname}")
                continue

            found.append((os.path.join(folder_path, fname), collection, source_type))

    return found


def index_file(filepath: str, collection: str, source_type: str) -> dict:
    from pipeline.chunker import chunk_document
    from pipeline.indexer import Indexer

    with open(filepath, "rb") as f:
        raw = f.read()

    # Write to uploads dir (same path the API uses)
    from config import get_settings
    s = get_settings()
    os.makedirs(s.upload_dir, exist_ok=True)
    dest = os.path.join(s.upload_dir, os.path.basename(filepath))
    with open(dest, "wb") as f:
        f.write(raw)

    # Parse text
    from api.routes.ingest import _read_text
    text = _read_text(dest, source_type)

    base_meta = {
        "filename": os.path.basename(filepath),
        "path": filepath,
        "source": collection,
    }
    chunks = chunk_document(text, source_type, base_meta)
    result = Indexer().index(chunks, collection)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Bulk-index data/ folder into Qdrant")
    parser.add_argument("--dry-run",    action="store_true", help="Show files without indexing")
    parser.add_argument("--collection", default=None,        help="Only index one collection")
    parser.add_argument("--force",      action="store_true", help="Clear registry before indexing")
    args = parser.parse_args()

    # Must run from backend/ so imports resolve
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(backend_dir)
    sys.path.insert(0, backend_dir)

    # Load .env so USE_LIGHTWEIGHT_EMBEDDER and other vars are set
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(backend_dir, ".env"))
    except ImportError:
        pass

    data_dir = resolve_data_dir()
    if not os.path.isdir(data_dir):
        print(f"❌ data/ folder not found at: {data_dir}")
        sys.exit(1)

    files = collect_files(data_dir, args.collection)
    if not files:
        print("No indexable files found.")
        return

    print(f"\n{'DRY RUN — ' if args.dry_run else ''}Found {len(files)} file(s) to index:\n")
    for fp, col, st in files:
        print(f"  [{col:15s}] ({st:13s}) {os.path.basename(fp)}")

    if args.dry_run:
        print("\n(dry run — nothing indexed)")
        return

    if args.force:
        from database.registry import clear_collection as _clear
        seen_cols: set[str] = set()
        for _, col, _ in files:
            if col not in seen_cols:
                _clear(col)
                print(f"  🗑  Cleared registry for: {col}")
                seen_cols.add(col)

    print()
    total_indexed = 0
    total_skipped = 0

    for filepath, collection, source_type in files:
        fname = os.path.basename(filepath)
        try:
            result = index_file(filepath, collection, source_type)
            idx = result.get("indexed", 0)
            skp = result.get("skipped", 0)
            total_indexed += idx
            total_skipped += skp
            status = "✅" if idx > 0 else "⏭ "
            print(f"  {status} [{collection:15s}] {fname:50s}  +{idx} indexed, {skp} skipped")
        except Exception as e:
            print(f"  ❌ [{collection:15s}] {fname:50s}  ERROR: {e}")

    print(f"\n{'─'*60}")
    print(f"  Total indexed : {total_indexed}")
    print(f"  Total skipped : {total_skipped}")
    print(f"{'─'*60}\n")


if __name__ == "__main__":
    main()
