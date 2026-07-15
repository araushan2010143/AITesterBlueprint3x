"""
Extract test files from ZIP uploads or remote repository URLs.

Supported sources:
  GitHub          — public repos, no token required
  GitLab          — public repos; pass token for private / self-hosted
  Bitbucket       — public repos; pass "username:app_password" as token for private
  Azure DevOps    — pass a Personal Access Token (PAT) for private repos
  S3              — public HTTPS URLs or presigned URLs; s3:// notation auto-converted
  Generic URL     — any direct .zip download link
  ZIP upload      — raw bytes from multipart file upload
"""
import base64
import io
import re
import zipfile
import urllib.request
import urllib.error
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
_UA = "QA-RAG-Migration/3.0"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _is_test_file(name: str, content: str) -> bool:
    ext = Path(name).suffix.lower()
    if ext not in TEST_EXTENSIONS:
        return False
    stem = Path(name).stem.lower()
    if "test" in stem or "spec" in stem:
        return True
    return any(m in content for m in TEST_MARKERS)


def _skip_path(path: str) -> bool:
    return any(p in SKIP_DIRS for p in Path(path).parts)


def _get(url: str, headers: dict = {}, timeout: int = 90) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": _UA, **headers})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _try_branches(fn, branches=("main", "master", "develop")):
    """Call fn(branch) for each branch, return first success."""
    last_exc = None
    for branch in branches:
        try:
            return fn(branch)
        except (urllib.error.HTTPError, urllib.error.URLError, Exception) as exc:
            last_exc = exc
    raise last_exc


# ── ZIP extractor (shared by all providers) ────────────────────────────────────

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


# ── GitHub ─────────────────────────────────────────────────────────────────────

def extract_from_github(url: str, token: str = "") -> List[Tuple[str, str]]:
    """
    Public GitHub repo (no token needed) or private with a Personal Access Token.
    Accepts: https://github.com/owner/repo  or  .../tree/branch
    """
    m = re.match(r"https?://github\.com/([^/]+)/([^/\s]+?)(?:/tree/([^/\s]+))?(?:/.*)?$", url.strip().rstrip("/"))
    if not m:
        raise ValueError(f"Cannot parse GitHub URL: {url!r}")
    owner, repo, branch = m.group(1), m.group(2), m.group(3)
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    def _dl(b: str) -> bytes:
        return _get(f"https://github.com/{owner}/{repo}/archive/refs/heads/{b}.zip", headers)

    data = _try_branches(_dl, (branch,) if branch else ("main", "master"))
    return extract_from_zip(data)


# ── GitLab ─────────────────────────────────────────────────────────────────────

def extract_from_gitlab(url: str, token: str = "") -> List[Tuple[str, str]]:
    """
    GitLab (gitlab.com or self-hosted).
    token: private token or personal access token for private repos.
    Accepts: https://gitlab.com/namespace/repo  or  .../tree/branch
    """
    url = url.strip().rstrip("/")

    # Extract base host + path components
    m = re.match(r"(https?://[^/]+)/(.+?)(?:/-/(?:tree|blob)/([^/]+))?(?:/.*)?$", url)
    if not m:
        raise ValueError(f"Cannot parse GitLab URL: {url!r}")

    host = m.group(1)              # e.g. https://gitlab.com
    namespace_repo = m.group(2)    # e.g. owner/repo  (may include subgroups)
    branch_hint = m.group(3)

    headers = {"PRIVATE-TOKEN": token} if token else {}

    def _dl(b: str) -> bytes:
        archive = f"{host}/{namespace_repo}/-/archive/{b}/{namespace_repo.split('/')[-1]}-{b}.zip"
        return _get(archive, headers)

    branches = (branch_hint,) if branch_hint else ("main", "master", "develop")
    data = _try_branches(_dl, branches)
    return extract_from_zip(data)


# ── Bitbucket ──────────────────────────────────────────────────────────────────

def extract_from_bitbucket(url: str, token: str = "") -> List[Tuple[str, str]]:
    """
    Bitbucket Cloud (bitbucket.org).
    token: "username:app_password" for private repos.
    Accepts: https://bitbucket.org/workspace/repo
    """
    m = re.match(r"https?://bitbucket\.org/([^/]+)/([^/\s]+?)(?:/.*)?$", url.strip().rstrip("/"))
    if not m:
        raise ValueError(f"Cannot parse Bitbucket URL: {url!r}")
    workspace, repo = m.group(1), m.group(2)

    headers: dict = {}
    if token:
        headers["Authorization"] = "Basic " + base64.b64encode(token.encode()).decode()

    def _dl(b: str) -> bytes:
        return _get(f"https://bitbucket.org/{workspace}/{repo}/get/{b}.zip", headers)

    data = _try_branches(_dl, ("main", "master", "develop"))
    return extract_from_zip(data)


# ── Azure DevOps ───────────────────────────────────────────────────────────────

def extract_from_azure_devops(url: str, token: str = "") -> List[Tuple[str, str]]:
    """
    Azure DevOps / VSTS.
    token: Personal Access Token (PAT) — required for private projects.
    Accepts: https://dev.azure.com/org/project/_git/repo
             https://org.visualstudio.com/project/_git/repo
    """
    url = url.strip()
    # dev.azure.com format
    m = re.match(r"https?://dev\.azure\.com/([^/]+)/([^/]+)/_git/([^/\s?]+)", url)
    if not m:
        # visualstudio.com format
        m = re.match(r"https?://([^.]+)\.visualstudio\.com/([^/]+)/_git/([^/\s?]+)", url)
        if m:
            org, project, repo = m.group(1), m.group(2), m.group(3)
        else:
            raise ValueError(f"Cannot parse Azure DevOps URL: {url!r}")
    else:
        org, project, repo = m.group(1), m.group(2), m.group(3)

    headers: dict = {}
    if token:
        headers["Authorization"] = "Basic " + base64.b64encode(f":{token}".encode()).decode()

    def _dl(b: str) -> bytes:
        api = (
            f"https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/items"
            f"?path=/&versionDescriptor.version={b}&$format=zip&recursionLevel=full&api-version=7.0"
        )
        return _get(api, headers)

    data = _try_branches(_dl, ("main", "master", "develop"))
    return extract_from_zip(data)


# ── S3 ─────────────────────────────────────────────────────────────────────────

def extract_from_s3(url: str) -> List[Tuple[str, str]]:
    """
    AWS S3 public bucket or presigned URL.

    Supported:
      s3://bucket-name/path/to/archive.zip   → converted to HTTPS virtual-hosted URL
      https://bucket.s3.amazonaws.com/key.zip
      https://s3.amazonaws.com/bucket/key.zip
      https://bucket.s3.region.amazonaws.com/key.zip
      Any S3 presigned URL (https://...)

    For private buckets: generate a presigned URL in the AWS Console
    (S3 → object → Share with pre-signed URL) and paste it here.
    """
    url = url.strip()

    # Convert s3:// notation to HTTPS virtual-hosted URL
    if url.startswith("s3://"):
        parts = url[5:].split("/", 1)
        bucket = parts[0]
        key = parts[1] if len(parts) > 1 else ""
        url = f"https://{bucket}.s3.amazonaws.com/{key}"

    data = _get(url, timeout=120)

    # Verify it looks like a ZIP
    if not data[:2] == b"PK":
        raise ValueError("Downloaded file is not a ZIP archive (expected PK magic bytes)")

    return extract_from_zip(data)


# ── Generic direct URL ─────────────────────────────────────────────────────────

def extract_from_direct_url(url: str) -> List[Tuple[str, str]]:
    """Download any direct .zip URL."""
    data = _get(url.strip(), timeout=120)
    if not data[:2] == b"PK":
        raise ValueError("Downloaded file is not a ZIP archive")
    return extract_from_zip(data)


# ── Unified dispatcher ─────────────────────────────────────────────────────────

def detect_source_type(url: str) -> str:
    url = url.strip()
    if "github.com" in url:
        return "github"
    if "gitlab" in url:
        return "gitlab"
    if "bitbucket.org" in url:
        return "bitbucket"
    if "dev.azure.com" in url or "visualstudio.com" in url:
        return "azure_devops"
    if url.startswith("s3://") or ".s3." in url or "s3.amazonaws.com" in url:
        return "s3"
    return "url"


def extract_from_url(url: str, token: str = "") -> List[Tuple[str, str]]:
    """
    Auto-detect the repository host and extract test files.
    `token` is used for GitLab (PRIVATE-TOKEN), Bitbucket (user:pass),
    Azure DevOps (PAT), and optionally GitHub (Bearer token).
    """
    src = detect_source_type(url)
    if src == "github":
        return extract_from_github(url, token)
    if src == "gitlab":
        return extract_from_gitlab(url, token)
    if src == "bitbucket":
        return extract_from_bitbucket(url, token)
    if src == "azure_devops":
        return extract_from_azure_devops(url, token)
    if src == "s3":
        return extract_from_s3(url)
    return extract_from_direct_url(url)
