"""
Extract test files from ZIP uploads or remote repository / storage URLs.

Supported sources (19 providers):
  Git repositories : GitHub, GitLab, Bitbucket Cloud, Bitbucket Server,
                     Azure DevOps, AWS CodeCommit, Gitea/Forgejo/Gogs
  Cloud storage    : AWS S3, Azure Blob, Google Cloud Storage
  File sharing     : Google Drive, OneDrive, SharePoint
  CI/CD artifacts  : Jenkins, GitHub Actions, GitLab CI, TeamCity, Bamboo
  Local upload     : ZIP archive, multi-file (folder picker)
"""
import base64
import io
import json
import re
import zipfile
import urllib.parse
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
MAX_FILE_BYTES = 200_000
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
    last_exc = None
    for branch in branches:
        try:
            return fn(branch)
        except (urllib.error.HTTPError, urllib.error.URLError, Exception) as exc:
            last_exc = exc
    raise last_exc


def _basic_auth(credential: str) -> str:
    return "Basic " + base64.b64encode(credential.encode()).decode()


def _walk_directory(root_dir: str) -> List[Tuple[str, str]]:
    import os
    files: List[Tuple[str, str]] = []
    for root, dirs, fnames in os.walk(root_dir):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in SKIP_DIRS]
        for fname in fnames:
            if Path(fname).suffix.lower() not in TEST_EXTENSIONS:
                continue
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, encoding="utf-8", errors="replace") as f:
                    content = f.read(MAX_FILE_BYTES)
            except Exception:
                continue
            if _is_test_file(fname, content):
                files.append((fname, content))
            if len(files) >= MAX_FILES:
                return files
    return files


def _git_clone_extract(clone_url: str, timeout_s: int = 120) -> List[Tuple[str, str]]:
    """Shallow-clone any HTTPS git repository and return test files."""
    import subprocess, os, tempfile
    if not clone_url.startswith(("https://", "http://")):
        raise ValueError("Only HTTPS/HTTP URLs are supported for git clone")
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_dir = os.path.join(tmpdir, "repo")
        result = subprocess.run(
            ["git", "clone", "--depth", "1", "--single-branch", clone_url, repo_dir],
            capture_output=True, text=True, timeout=timeout_s,
        )
        if result.returncode != 0:
            stderr = re.sub(r"://[^@]+@", "://<credentials>@", result.stderr[:500])
            raise ValueError(f"git clone failed: {stderr}")
        return _walk_directory(repo_dir)


# ── ZIP extractor (shared by all providers) ────────────────────────────────────

def extract_from_zip(data: bytes) -> List[Tuple[str, str]]:
    """Return [(filename, content), ...] for test files found in the ZIP bytes."""
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


def extract_from_file_list(file_list: list) -> List[Tuple[str, str]]:
    """Extract test files from [(filename, bytes_or_str), ...] — used for folder uploads."""
    results: List[Tuple[str, str]] = []
    for fname, data in file_list:
        content = data.decode("utf-8", errors="replace") if isinstance(data, bytes) else str(data)
        if len(content) > MAX_FILE_BYTES:
            continue
        if _is_test_file(fname, content):
            results.append((Path(fname).name, content))
        if len(results) >= MAX_FILES:
            break
    return results


# ── ── ── ── ── ── ── ── ── ── ── GIT REPOSITORIES ── ── ── ── ── ── ── ── ── ──

def extract_from_github(url: str, token: str = "", branch: str = "") -> List[Tuple[str, str]]:
    """
    GitHub (github.com).  Public repos need no token.
    token : Personal Access Token (ghp_…) for private repos.
    branch: explicit branch name; overrides URL and auto-detection.
    URL   : https://github.com/owner/repo  or  .../tree/branch
    """
    m = re.match(
        r"https?://github\.com/([^/]+)/([^/\s]+?)(?:/tree/([^/\s]+))?(?:/.*)?$",
        url.strip().rstrip("/"),
    )
    if not m:
        raise ValueError(f"Cannot parse GitHub URL: {url!r}")
    owner, repo, url_branch = m.group(1), m.group(2), m.group(3)
    effective = branch or url_branch
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    def _dl(b: str) -> bytes:
        return _get(f"https://github.com/{owner}/{repo}/archive/refs/heads/{b}.zip", headers)

    data = _try_branches(_dl, (effective,) if effective else ("main", "master"))
    return extract_from_zip(data)


def extract_from_github_actions(url: str, token: str = "") -> List[Tuple[str, str]]:
    """
    GitHub Actions artifact download.
    token: PAT with actions:read + repo scope.
    URL  : https://github.com/owner/repo/actions/runs/{run_id}
           https://github.com/owner/repo/actions/artifacts/{artifact_id}
    """
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    } if token else {}

    owner_repo_m = re.search(r"github\.com/([^/]+/[^/]+)", url)
    if not owner_repo_m:
        raise ValueError("Cannot extract owner/repo from GitHub Actions URL")
    owner_repo = owner_repo_m.group(1).rstrip("/")

    # Direct artifact ID
    art_m = re.search(r"/actions/artifacts/(\d+)", url)
    if art_m:
        data = _get(
            f"https://api.github.com/repos/{owner_repo}/actions/artifacts/{art_m.group(1)}/zip",
            headers, timeout=180,
        )
        return extract_from_zip(data)

    # Run ID → list artifacts → download first
    run_m = re.search(r"/actions/runs/(\d+)", url)
    if not run_m:
        raise ValueError("GitHub Actions URL must contain /actions/runs/{run_id} or /actions/artifacts/{id}")
    run_id = run_m.group(1)

    resp = json.loads(_get(
        f"https://api.github.com/repos/{owner_repo}/actions/runs/{run_id}/artifacts",
        headers,
    ).decode())
    artifacts = resp.get("artifacts", [])
    if not artifacts:
        raise ValueError(f"No artifacts found for run {run_id}")

    data = _get(artifacts[0]["archive_download_url"], headers, timeout=180)
    return extract_from_zip(data)


def extract_from_gitlab(url: str, token: str = "", branch: str = "") -> List[Tuple[str, str]]:
    """
    GitLab (gitlab.com or self-hosted).
    token : Private-Token / Personal Access Token for private repos.
    branch: explicit branch name; overrides URL and auto-detection.
    URL   : https://gitlab.com/namespace/repo  or  .../tree/branch
    """
    url = url.strip().rstrip("/")
    m = re.match(r"(https?://[^/]+)/(.+?)(?:/-/(?:tree|blob)/([^/]+))?(?:/.*)?$", url)
    if not m:
        raise ValueError(f"Cannot parse GitLab URL: {url!r}")
    host, namespace_repo, url_branch = m.group(1), m.group(2), m.group(3)
    effective = branch or url_branch
    headers = {"PRIVATE-TOKEN": token} if token else {}

    def _dl(b: str) -> bytes:
        slug = namespace_repo.split("/")[-1]
        return _get(f"{host}/{namespace_repo}/-/archive/{b}/{slug}-{b}.zip", headers)

    data = _try_branches(_dl, (effective,) if effective else ("main", "master", "develop"))
    return extract_from_zip(data)


def extract_from_gitlab_ci(url: str, token: str = "") -> List[Tuple[str, str]]:
    """
    GitLab CI artifact download.
    token: Private/Personal Access Token with read_api scope.
    URL  : https://gitlab.com/ns/repo/-/jobs/{job_id}/artifacts
    """
    url = url.strip().rstrip("/")
    headers: dict = {"PRIVATE-TOKEN": token} if token else {}

    job_m = re.search(r"/-/jobs/(\d+)", url)
    if not job_m:
        raise ValueError("GitLab CI URL must contain /-/jobs/{job_id}")
    job_id = job_m.group(1)

    host_m = re.match(r"(https?://[^/]+)/(.+?)/-/", url)
    if not host_m:
        raise ValueError(f"Cannot parse GitLab URL: {url!r}")
    host, namespace_repo = host_m.group(1), host_m.group(2)

    project_encoded = urllib.parse.quote(namespace_repo, safe="")
    data = _get(
        f"{host}/api/v4/projects/{project_encoded}/jobs/{job_id}/artifacts",
        headers, timeout=180,
    )
    if data[:2] != b"PK":
        raise ValueError("GitLab CI artifact is not a ZIP archive")
    return extract_from_zip(data)


def extract_from_bitbucket(url: str, token: str = "", branch: str = "") -> List[Tuple[str, str]]:
    """
    Bitbucket Cloud (bitbucket.org).
    token : "username:app_password" for private repos.
    branch: explicit branch name; overrides auto-detection.
    URL   : https://bitbucket.org/workspace/repo
    """
    m = re.match(r"https?://bitbucket\.org/([^/]+)/([^/\s]+?)(?:/.*)?$", url.strip().rstrip("/"))
    if not m:
        raise ValueError(f"Cannot parse Bitbucket URL: {url!r}")
    workspace, repo = m.group(1), m.group(2)
    headers: dict = {}
    if token:
        headers["Authorization"] = _basic_auth(token)

    def _dl(b: str) -> bytes:
        return _get(f"https://bitbucket.org/{workspace}/{repo}/get/{b}.zip", headers)

    data = _try_branches(_dl, (branch,) if branch else ("main", "master", "develop"))
    return extract_from_zip(data)


def extract_from_bitbucket_server(url: str, token: str = "", branch: str = "") -> List[Tuple[str, str]]:
    """
    Bitbucket Server / Data Center (self-hosted Atlassian).
    token : "username:password" (basic auth) or Personal Access Token (Bearer).
    branch: explicit branch name; overrides auto-detection.
    URL   : https://bitbucket.company.com/projects/PROJ/repos/REPO
    """
    url = url.strip().rstrip("/")
    m = re.match(r"(https?://[^/]+)/projects/([^/]+)/repos/([^/\s?#]+)", url)
    if not m:
        m = re.match(r"(https?://[^/]+)/scm/([^/]+)/([^/\s?#.]+)", url)
    if not m:
        raise ValueError(
            f"Cannot parse Bitbucket Server URL: {url!r}\n"
            "Expected: https://bitbucket.company.com/projects/PROJ/repos/REPO"
        )
    host, proj, repo = m.group(1), m.group(2), m.group(3)

    headers: dict = {}
    if token:
        headers["Authorization"] = _basic_auth(token) if ":" in token else f"Bearer {token}"

    def _dl(b: str) -> bytes:
        api = (
            f"{host}/rest/api/1.0/projects/{proj}/repos/{repo}"
            f"/archive?format=zip&at=refs/heads/{b}&prefix={repo}"
        )
        return _get(api, headers)

    data = _try_branches(_dl, (branch,) if branch else ("main", "master", "develop"))
    return extract_from_zip(data)


def extract_from_azure_devops(url: str, token: str = "", branch: str = "") -> List[Tuple[str, str]]:
    """
    Azure DevOps / VSTS.
    token: Personal Access Token (Code → Read scope).
    URL  : https://dev.azure.com/org/project/_git/repo
           https://org.visualstudio.com/project/_git/repo
    """
    url = url.strip()
    m = re.match(r"https?://dev\.azure\.com/([^/]+)/([^/]+)/_git/([^/\s?]+)", url)
    if not m:
        m = re.match(r"https?://([^.]+)\.visualstudio\.com/([^/]+)/_git/([^/\s?]+)", url)
        if m:
            org, project, repo = m.group(1), m.group(2), m.group(3)
        else:
            raise ValueError(f"Cannot parse Azure DevOps URL: {url!r}")
    else:
        org, project, repo = m.group(1), m.group(2), m.group(3)

    headers: dict = {}
    if token:
        headers["Authorization"] = _basic_auth(f":{token}")

    def _dl(b: str) -> bytes:
        api = (
            f"https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/items"
            f"?path=/&versionDescriptor.version={b}&$format=zip&recursionLevel=full&api-version=7.0"
        )
        return _get(api, headers)

    data = _try_branches(_dl, (branch,) if branch else ("main", "master", "develop"))
    return extract_from_zip(data)


def extract_from_codecommit(url: str, token: str = "") -> List[Tuple[str, str]]:
    """
    AWS CodeCommit via HTTPS git clone (shallow, depth=1).
    token: "username:password" from IAM → Security credentials →
           HTTPS Git credentials for CodeCommit.
    URL  : https://git-codecommit.{region}.amazonaws.com/v1/repos/{repo}
    """
    url = url.strip()
    clone_url = url
    if token and "://" in url and "@" not in url:
        scheme, rest = url.split("://", 1)
        clone_url = f"{scheme}://{urllib.parse.quote(token, safe=':@')}@{rest}"
    return _git_clone_extract(clone_url, timeout_s=150)


def extract_from_gitea(url: str, token: str = "", branch: str = "") -> List[Tuple[str, str]]:
    """
    Gitea / Forgejo / Gogs (self-hosted GitHub-compatible).
    token : Personal Access Token (Settings → Applications → Generate Token).
    branch: explicit branch; overrides auto-detection.
    URL   : https://gitea.company.com/owner/repo
    """
    url = url.strip().rstrip("/")
    m = re.match(r"(https?://[^/]+)/([^/]+)/([^/\s?#]+?)(?:\.git)?(?:/.*)?$", url)
    if not m:
        raise ValueError(f"Cannot parse Gitea URL: {url!r}")
    host, owner, repo = m.group(1), m.group(2), m.group(3)
    headers = {"Authorization": f"token {token}"} if token else {}

    def _dl(b: str) -> bytes:
        return _get(f"{host}/{owner}/{repo}/archive/{b}.zip", headers)

    data = _try_branches(_dl, (branch,) if branch else ("main", "master", "develop"))
    return extract_from_zip(data)


# ── ── ── ── ── ── ── ── ── ── ── CLOUD STORAGE ── ── ── ── ── ── ── ── ── ── ──

def extract_from_s3(url: str) -> List[Tuple[str, str]]:
    """
    AWS S3 public bucket or presigned URL.
    s3://bucket/key  is auto-converted to the HTTPS virtual-hosted URL.
    For private buckets: generate a presigned URL in the AWS Console.
    """
    url = url.strip()
    if url.startswith("s3://"):
        parts = url[5:].split("/", 1)
        bucket = parts[0]
        key = parts[1] if len(parts) > 1 else ""
        url = f"https://{bucket}.s3.amazonaws.com/{key}"

    data = _get(url, timeout=120)
    if data[:2] != b"PK":
        raise ValueError("Downloaded S3 object is not a ZIP archive (expected PK magic bytes)")
    return extract_from_zip(data)


def extract_from_azure_blob(url: str, token: str = "") -> List[Tuple[str, str]]:
    """
    Azure Blob Storage.
    Works with SAS URLs (include SAS token in the URL) or public blobs.
    token: raw SAS token (appended to URL) or "Bearer {access_token}".
    URL  : https://{account}.blob.core.windows.net/{container}/{blob}[?sas...]
    """
    url = url.strip()
    headers: dict = {}
    if token:
        if token.startswith("Bearer "):
            headers["Authorization"] = token
            headers["x-ms-version"] = "2020-10-02"
        else:
            sep = "&" if "?" in url else "?"
            url = url + sep + token.lstrip("?&")

    data = _get(url, headers, timeout=120)
    if data[:2] != b"PK":
        raise ValueError("Downloaded Azure Blob is not a ZIP archive")
    return extract_from_zip(data)


def extract_from_gcs(url: str, token: str = "") -> List[Tuple[str, str]]:
    """
    Google Cloud Storage — public objects or signed URLs.
    token: Bearer access token (gcloud auth print-access-token) for private objects.
    URL  : https://storage.googleapis.com/bucket/object.zip  or signed URL.
    """
    url = url.strip()
    headers: dict = {}
    if token:
        headers["Authorization"] = token if token.startswith("Bearer ") else f"Bearer {token}"

    data = _get(url, headers, timeout=120)
    if data[:2] != b"PK":
        raise ValueError("Downloaded GCS object is not a ZIP archive")
    return extract_from_zip(data)


# ── ── ── ── ── ── ── ── ── ── ── FILE SHARING ── ── ── ── ── ── ── ── ── ── ──

def extract_from_google_drive(url: str) -> List[Tuple[str, str]]:
    """
    Google Drive public file (shared with 'Anyone with the link').
    The shared file must be a .zip archive.
    URL  : https://drive.google.com/file/d/{id}/view
           https://drive.google.com/open?id={id}
    """
    url = url.strip()
    m = re.search(r"/file/d/([a-zA-Z0-9_-]+)", url)
    if not m:
        m = re.search(r"[?&]id=([a-zA-Z0-9_-]+)", url)
    if not m:
        raise ValueError("Cannot extract file ID from Google Drive URL — use the sharing link from Google Drive")

    file_id = m.group(1)
    download_url = f"https://drive.google.com/uc?id={file_id}&export=download&confirm=t"
    data = _get(download_url, timeout=180)
    if data[:2] != b"PK":
        raise ValueError(
            "Google Drive file is not a ZIP archive "
            "(ensure the file is a .zip and publicly shared)"
        )
    return extract_from_zip(data)


def extract_from_onedrive(url: str) -> List[Tuple[str, str]]:
    """
    OneDrive public sharing link.
    Use the 'Download' copy URL, not the 'Open' URL.
    URL  : https://1drv.ms/...   https://onedrive.live.com/download?...
    """
    url = url.strip()
    if "onedrive.live.com/redir" in url:
        url = url.replace("/redir?", "/download?")

    data = _get(url, timeout=180)
    if data[:2] != b"PK":
        sep = "&" if "?" in url else "?"
        data = _get(url + sep + "download=1", timeout=180)
    if data[:2] != b"PK":
        raise ValueError(
            "OneDrive file is not a ZIP archive — use the direct download link "
            "(right-click → Download in OneDrive, then copy that URL)"
        )
    return extract_from_zip(data)


def extract_from_sharepoint(url: str, token: str = "") -> List[Tuple[str, str]]:
    """
    SharePoint file download.
    token: Bearer access token (Microsoft Graph) for private files.
    URL  : Direct file URL or sharing link ending in ?e=... or /:u:/g/...
    Tip  : In SharePoint, click '...' → Copy direct link (not the share page).
    """
    url = url.strip()
    headers: dict = {}
    if token:
        headers["Authorization"] = token if token.startswith("Bearer ") else f"Bearer {token}"

    if "/:u:/" in url or "/:f:/" in url:
        sep = "&" if "?" in url else "?"
        url = url + sep + "download=1"

    data = _get(url, headers, timeout=180)
    if data[:2] != b"PK":
        raise ValueError(
            "SharePoint file is not a ZIP archive — use the direct file download URL, not the page URL"
        )
    return extract_from_zip(data)


# ── ── ── ── ── ── ── ── ── ── ── CI/CD ARTIFACTS ── ── ── ── ── ── ── ── ── ──

def extract_from_jenkins(url: str, token: str = "") -> List[Tuple[str, str]]:
    """
    Jenkins artifact download.
    token: "username:api_token"  (User → Configure → API Token).
    URL  : https://jenkins.company.com/job/MyJob            (auto-appends archive path)
           https://jenkins.company.com/job/MyJob/lastSuccessfulBuild/artifact/*zip*/archive.zip
           https://jenkins.company.com/job/MyJob/42/artifact/tests.zip
    """
    url = url.strip().rstrip("/")
    if "/artifact/" not in url:
        if "/lastSuccessfulBuild" not in url and "/lastBuild" not in url:
            url = url + "/lastSuccessfulBuild"
        url = url + "/artifact/*zip*/archive.zip"

    headers: dict = {}
    if token:
        headers["Authorization"] = _basic_auth(token)

    data = _get(url, headers, timeout=180)
    if data[:2] != b"PK":
        raise ValueError("Jenkins artifact is not a ZIP archive")
    return extract_from_zip(data)


def extract_from_teamcity(url: str, token: str = "") -> List[Tuple[str, str]]:
    """
    TeamCity artifact download.
    token: "username:password" or Bearer token.
    URL  : https://teamcity.company.com/repository/download/{buildTypeId}/lastSuccessful/{file.zip}
           https://teamcity.company.com/repository/download/{buildTypeId}/{buildId}:id/{file.zip}
    """
    url = url.strip()
    headers: dict = {}
    if token:
        if ":" in token:
            headers["Authorization"] = _basic_auth(token)
        else:
            headers["Authorization"] = f"Bearer {token}"

    data = _get(url, headers, timeout=180)
    if data[:2] != b"PK":
        raise ValueError("TeamCity artifact is not a ZIP archive")
    return extract_from_zip(data)


def extract_from_bamboo(url: str, token: str = "") -> List[Tuple[str, str]]:
    """
    Atlassian Bamboo artifact download.
    token: "username:password" for Bamboo basic auth.
    URL  : https://bamboo.company.com/artifact/{PROJ-PLAN}/{job}/{artifact.zip}
           https://bamboo.company.com/browse/{PLAN-JOB}/artifact/{artifact.zip}
    """
    url = url.strip()
    headers: dict = {}
    if token:
        headers["Authorization"] = _basic_auth(token)

    data = _get(url, headers, timeout=180)
    if data[:2] != b"PK":
        raise ValueError("Bamboo artifact is not a ZIP archive")
    return extract_from_zip(data)


# ── ── ── ── ── ── ── ── ── ── ── GENERIC ── ── ── ── ── ── ── ── ── ── ── ──

def extract_from_direct_url(url: str, token: str = "") -> List[Tuple[str, str]]:
    """Download any direct .zip URL with optional Bearer token."""
    headers: dict = {}
    if token:
        headers["Authorization"] = token if token.startswith("Bearer ") else f"Bearer {token}"
    data = _get(url.strip(), headers, timeout=120)
    if data[:2] != b"PK":
        raise ValueError("URL does not point to a ZIP archive")
    return extract_from_zip(data)


# ── Routing ────────────────────────────────────────────────────────────────────

_EXTRACTORS = {
    # Git repos — accept optional branch kwarg
    "github":           lambda u, t, b="": extract_from_github(u, t, branch=b),
    "github_actions":   lambda u, t, b="": extract_from_github_actions(u, t),
    "gitlab":           lambda u, t, b="": extract_from_gitlab(u, t, branch=b),
    "gitlab_ci":        lambda u, t, b="": extract_from_gitlab_ci(u, t),
    "bitbucket":        lambda u, t, b="": extract_from_bitbucket(u, t, branch=b),
    "bitbucket_server": lambda u, t, b="": extract_from_bitbucket_server(u, t, branch=b),
    "azure_devops":     lambda u, t, b="": extract_from_azure_devops(u, t, branch=b),
    "azure":            lambda u, t, b="": extract_from_azure_devops(u, t, branch=b),
    "codecommit":       lambda u, t, b="": extract_from_codecommit(u, t),
    "gitea":            lambda u, t, b="": extract_from_gitea(u, t, branch=b),
    # Cloud storage (no branch concept)
    "s3":               lambda u, t, b="": extract_from_s3(u),
    "azure_blob":       lambda u, t, b="": extract_from_azure_blob(u, t),
    "gcs":              lambda u, t, b="": extract_from_gcs(u, t),
    # File sharing (no branch concept)
    "google_drive":     lambda u, t, b="": extract_from_google_drive(u),
    "onedrive":         lambda u, t, b="": extract_from_onedrive(u),
    "sharepoint":       lambda u, t, b="": extract_from_sharepoint(u, t),
    # CI/CD (no branch concept)
    "jenkins":          lambda u, t, b="": extract_from_jenkins(u, t),
    "teamcity":         lambda u, t, b="": extract_from_teamcity(u, t),
    "bamboo":           lambda u, t, b="": extract_from_bamboo(u, t),
}


def detect_source_type(url: str) -> str:
    u = url.strip().lower()

    # GitHub
    if "github.com" in u:
        return "github_actions" if ("/actions/runs/" in u or "/actions/artifacts/" in u) else "github"

    # GitLab
    if "gitlab" in u:
        return "gitlab_ci" if ("/-/jobs/" in u) else "gitlab"

    # Bitbucket
    if "bitbucket.org" in u:
        return "bitbucket"
    if "bitbucket." in u:
        return "bitbucket_server"

    # Azure
    if "dev.azure.com" in u or "visualstudio.com" in u:
        return "azure_devops"
    if "blob.core.windows.net" in u:
        return "azure_blob"

    # AWS
    if "git-codecommit." in u:
        return "codecommit"
    if u.startswith("s3://") or ".s3." in u or "s3.amazonaws.com" in u:
        return "s3"

    # Google
    if "drive.google.com" in u:
        return "google_drive"
    if "storage.googleapis.com" in u or "storage.cloud.google.com" in u:
        return "gcs"

    # Microsoft
    if "onedrive.live.com" in u or "1drv.ms" in u:
        return "onedrive"
    if "sharepoint.com" in u:
        return "sharepoint"

    # CI/CD (domain-based — custom domains need explicit source_type_hint from frontend)
    if "teamcity." in u or "/repository/download/" in u:
        return "teamcity"
    if "bamboo." in u:
        return "bamboo"
    # Jenkins / Gitea: too ambiguous to auto-detect from URL shape alone

    return "url"


def extract_from_url(url: str, token: str = "", source_type: str = "", branch: str = "") -> List[Tuple[str, str]]:
    """
    Auto-detect or use explicit source_type hint to extract test files.
    source_type: one of the _EXTRACTORS keys (passed from frontend pill selection).
    branch     : explicit branch name for Git sources (blank = auto-detect).
    """
    src = source_type or detect_source_type(url)
    fn = _EXTRACTORS.get(src)
    if fn:
        return fn(url, token, branch)
    return extract_from_direct_url(url, token)
