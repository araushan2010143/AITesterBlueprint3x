"""
Ingest two local test frameworks into QA Intelligence Platform.

  selenium  ← /selenium Framework Practice  (Java, TestNG, POM)
  playwright ← /playwright-api-bdd-framework (TypeScript, BDD, API testing)

Run from backend/:
    python scripts/ingest_frameworks.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from pipeline.parsers.code_parser import parse_code_file
from pipeline.parsers.markdown_parser import parse_markdown
from pipeline.chunker import chunk_document
from pipeline.indexer import Indexer

# ── File type → source_type mapping ──────────────────────────────────────────
CODE_EXTS    = {".java", ".ts", ".tsx", ".js", ".py", ".cs", ".go"}
MARKDOWN_EXTS = {".md", ".markdown"}
TEXT_EXTS     = {".xml", ".properties", ".yml", ".yaml", ".feature", ".json"}
SKIP_DIRS     = {
    "node_modules", ".git", "target", "dist", "coverage",
    "allure-results", "reports", ".mvn",
}
SKIP_FILES    = {"package-lock.json"}

def collect_files(root: str, allowed_exts: set) -> list[str]:
    result = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune unwanted dirs in-place
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if fn in SKIP_FILES:
                continue
            ext = os.path.splitext(fn)[1].lower()
            if ext in allowed_exts:
                result.append(os.path.join(dirpath, fn))
    return sorted(result)


def ingest_framework(
    root: str,
    collection: str,
    framework: str,
    repo: str,
):
    indexer = Indexer()
    all_exts = CODE_EXTS | MARKDOWN_EXTS | TEXT_EXTS
    files = collect_files(root, all_exts)
    total_indexed = 0
    total_skipped = 0

    print(f"\n{'='*60}")
    print(f"  Ingesting: {repo}")
    print(f"  Collection: {collection}  |  Framework: {framework}")
    print(f"  Files found: {len(files)}")
    print(f"{'='*60}")

    for path in files:
        ext = os.path.splitext(path)[1].lower()
        filename = os.path.basename(path)
        rel_path = os.path.relpath(path, root)

        try:
            # Parse
            if ext in CODE_EXTS:
                text, meta = parse_code_file(path, repo=repo, framework=framework)
                source_type = "code"
            elif ext in MARKDOWN_EXTS:
                text, meta = parse_markdown(path)
                source_type = "markdown"
            else:
                with open(path, "r", encoding="utf-8", errors="replace") as f:
                    text = f.read()
                source_type = "text"
                meta = {"source": "text", "filename": filename, "path": path}

            if not text.strip():
                print(f"  SKIP (empty)  {rel_path}")
                continue

            # Enrich metadata
            meta.update({
                "repo":       repo,
                "framework":  framework,
                "path":       rel_path,
                "filename":   filename,
                "source":     collection,
            })

            # .feature files → treat as text but label as BDD
            if ext == ".feature":
                meta["chunk_type"] = "bdd_feature"

            # Chunk
            chunks = chunk_document(text, source_type, meta)  # type: ignore

            # Index
            result = indexer.index(chunks, collection)
            total_indexed += result["indexed"]
            total_skipped += result["skipped"]

            status = "✓" if result["indexed"] > 0 else "~"
            print(f"  {status} [{result['indexed']:2d} new | {result['skipped']:2d} skip]  {rel_path}")

        except Exception as e:
            print(f"  ✗ ERROR  {rel_path}: {e}")

    print(f"\n  DONE → {total_indexed} chunks indexed, {total_skipped} skipped (already in DB)")
    return total_indexed


if __name__ == "__main__":
    SELENIUM_ROOT   = "/Users/abhishekraushan/Documents/AITESTERBLUEPRINT_3X/selenium Framework Practice"
    PLAYWRIGHT_ROOT = "/Users/abhishekraushan/Documents/AITESTERBLUEPRINT_3X/playwright-api-bdd-framework"

    sel_count = ingest_framework(
        root=SELENIUM_ROOT,
        collection="selenium",
        framework="selenium",
        repo="selenium-framework-practice",
    )

    pw_count = ingest_framework(
        root=PLAYWRIGHT_ROOT,
        collection="playwright",
        framework="playwright",
        repo="playwright-api-bdd-framework",
    )

    print(f"\n{'='*60}")
    print(f"  TOTAL INDEXED: {sel_count + pw_count} chunks across 2 collections")
    print(f"  selenium  collection: ready")
    print(f"  playwright collection: ready")
    print(f"\n  Open http://localhost:3000/chat and ask:")
    print(f"    'How does DriverFactory work in the Selenium framework?'")
    print(f"    'Show me the booking API steps in Playwright BDD'")
    print(f"{'='*60}\n")
