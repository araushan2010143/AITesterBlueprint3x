"""Extract test files from ZIP uploads or GitHub repository URLs."""
import io
import re
import zipfile
import urllib.request
from pathlib import Path
from typing import List, Tuple

TEST_EXTENSIONS = {".java", ".py", ".cs", ".robot", ".feature", ".ts", ".js"}
TEST_MARKERS = [
    "@Test", "[Test]", "[TestMethod]", "def test_",
    "it(", "test(", "describe(", "*** Test Cases", "Scenario:", "@Scenario",
    "SpecFlow", "NUnit", "MSTest", "TestNG",
]
SKIP_DIRS = {
    "node_modules", ".git", "dist", "build", "target", "__pycache__",
    ".idea", ".vscode", "vendor", "bin", "obj",
}
MAX_FILE_BYTES = 200_000   # 200 KB per file
MAX_FILES = 50


def _is_test_file(name: str, content: str) -> bool:
    ext = Path(name).suffix.lower()
    if ext not in TEST_EXTENSIONS:
        return False
    stem = Path(name).stem.lower()
    if "test" in stem or "spec" in stem:
        return True
    return any(m in content for m in TEST_MARKERS)


def _skip_path(path: str) -> bool:
    parts = Path(path).parts
    return any(p in SKIP_DIRS for p in parts)


def extract_from_zip(data: bytes) -> List[Tuple[str, str]]:
    """Return [(filename, content), ...] for test files found in the ZIP."""
    results: List[Tuple[str, str]] = []
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for info in zf.infolist():
            if info.is_dir() or info.file_size > MAX_FILE_BYTES:
                continue
            if _skip_path(info.filename):
                continue
            if Path(info.filename).suffix.lower() not in TEST_EXTENSIONS:
                continue
            try:
                content = zf.read(info).decode("utf-8", errors="replace")
            except Exception:
                continue
            if _is_test_file(info.filename, content):
                results.append((Path(info.filename).name, content))
            if len(results) >= MAX_FILES:
                break
    return results


def extract_from_github(url: str) -> List[Tuple[str, str]]:
    """
    Download a public GitHub repo as ZIP and extract test files.
    Accepts: https://github.com/owner/repo  or  https://github.com/owner/repo/tree/branch/...
    """
    m = re.match(r"https://github\.com/([^/]+)/([^/]+)(?:/tree/([^/]+))?", url.strip())
    if not m:
        raise ValueError(f"Cannot parse GitHub URL: {url!r}")
    owner, repo, branch = m.group(1), m.group(2), m.group(3) or "main"
    repo = repo.rstrip("/")

    def _download(branch_name: str) -> bytes:
        zip_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/{branch_name}.zip"
        req = urllib.request.Request(
            zip_url, headers={"User-Agent": "QA-RAG-Migration/2.0"}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read()

    try:
        data = _download(branch)
    except Exception:
        data = _download("master")   # fallback for repos still on master

    return extract_from_zip(data)
