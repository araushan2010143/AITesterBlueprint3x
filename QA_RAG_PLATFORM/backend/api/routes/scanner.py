"""Pre-migration Project Scanner routes.

Endpoints:
  POST /api/scanner/scan-url   — scan a repo URL (no migration)
  POST /api/scanner/scan       — scan uploaded files
  GET  /api/scanner/explore    — get file TREE from a repo (lightweight)
"""
from __future__ import annotations
import json
import re
import urllib.request
import urllib.parse
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from backend.services.file_extractor import (
    extract_from_url, extract_from_file_list, detect_source_type,
)
from backend.services.project_scanner import scan_project
from backend.services.ai_summary_service import generate_summary
from backend.services.file_analysis_service import analyze_file as ai_analyze_file
from backend.services.svn_source import extract_svn_files, is_svn_url, is_p4_depot, extract_p4_files

router = APIRouter(prefix="/api/scanner", tags=["Project Scanner"])


# ── Scan uploaded files ───────────────────────────────────────────────────────

@router.post("/scan")
async def scan_files(files: List[UploadFile] = File(...)):
    """Scan locally-uploaded files and return project analysis (no migration)."""
    raw = [
        (uf.filename or f"file_{i}", (await uf.read()).decode("utf-8", errors="replace"))
        for i, uf in enumerate(files)
    ]
    result = scan_project(raw)
    result["source_name"] = f"Upload ({len(raw)} files)"
    return result


# ── Scan a repo URL ───────────────────────────────────────────────────────────

@router.post("/scan-url")
async def scan_url(
    repo_url: str = Form(...),
    repo_token: Optional[str] = Form(""),
    repo_branch: Optional[str] = Form(""),
    source_type_hint: Optional[str] = Form(""),
    path_filter: Optional[str] = Form(""),   # e.g. "automation/tests" for monorepos
):
    """Fetch a repository and return a project scan report (no migration started)."""
    url = repo_url.strip()

    # SVN / Perforce detection — handled separately from git-based sources
    if is_svn_url(url):
        raw_files, err = extract_svn_files(
            url,
            username=repo_token or None,
            path_filter=path_filter or None,
        )
        if err:
            raise HTTPException(400, f"SVN error: {err}")
        files = [(f["filename"], f["content"]) for f in raw_files]
        source_type = "svn"
    elif is_p4_depot(url):
        raw_files, err = extract_p4_files(url, path_filter=path_filter or None)
        if err:
            raise HTTPException(400, f"Perforce error: {err}")
        files = [(f["filename"], f["content"]) for f in raw_files]
        source_type = "perforce"
    else:
        source_type = source_type_hint or detect_source_type(url)
        try:
            files = extract_from_url(
                url,
                token=repo_token or "",
                source_type=source_type,
                branch=repo_branch or "",
            )
        except Exception as exc:
            raise HTTPException(400, f"Could not fetch repository: {exc}")

    # Monorepo subfolder filter — keep only files under the specified path prefix
    if path_filter and path_filter.strip():
        prefix = path_filter.strip().lstrip("/")
        files = [(name, content) for name, content in files if name.startswith(prefix)]

    if not files:
        raise HTTPException(400, "No test files found in repository")

    result = scan_project(files)
    result["source_name"] = url
    result["source_type"] = source_type
    result["path_filter"] = path_filter or ""
    # Lightweight file listing (no content) for the tree view
    result["file_list"] = [
        {
            "name": fd["name"],
            "type": fd["type"],
            "complexity": fd["complexity"],
            "tests": fd["tests"],
            "language": fd["language"],
        }
        for fd in result.get("file_details", [])
    ]
    return result


# ── AI Repository Summary ──────────────────────────────────────────────────────

@router.post("/ai-summary")
async def ai_summary(
    repo_url: str = Form(...),
    repo_token: Optional[str] = Form(""),
    repo_branch: Optional[str] = Form(""),
    source_type_hint: Optional[str] = Form(""),
    path_filter: Optional[str] = Form(""),
    scan_json: Optional[str] = Form(""),   # if scan already done, pass result as JSON
):
    """Generate an LLM-authored project brief from a prior scan result or fresh fetch."""
    if scan_json and scan_json.strip():
        import json as _json
        try:
            scan_result = _json.loads(scan_json)
        except Exception:
            raise HTTPException(400, "Invalid scan_json")
    else:
        url = repo_url.strip()
        source_type = source_type_hint or detect_source_type(url)
        try:
            files = extract_from_url(url, token=repo_token or "", source_type=source_type, branch=repo_branch or "")
        except Exception as exc:
            raise HTTPException(400, f"Could not fetch repository: {exc}")

        if path_filter and path_filter.strip():
            prefix = path_filter.strip().lstrip("/")
            files = [(n, c) for n, c in files if n.startswith(prefix)]

        if not files:
            raise HTTPException(400, "No files found")

        scan_result = scan_project(files)

    try:
        summary_md = generate_summary(scan_result)
    except Exception as exc:
        raise HTTPException(500, f"AI summary generation failed: {exc}")

    return {"summary": summary_md, "readiness_score": scan_result.get("readiness_score")}


# ── AI per-file analysis ──────────────────────────────────────────────────────

class FileAnalyzeIn(BaseModel):
    filename: str
    content: str
    language: str = "Unknown"
    file_type: str = "test"
    complexity: str = "medium"
    tests: int = 0


@router.post("/analyze-file")
async def analyze_file_endpoint(body: FileAnalyzeIn):
    """Run an LLM deep-dive on a single test file and return structured analysis."""
    if not body.content.strip():
        raise HTTPException(400, "File content is empty")
    try:
        result = ai_analyze_file(
            filename=body.filename,
            content=body.content,
            language=body.language,
            file_type=body.file_type,
            complexity=body.complexity,
            tests=body.tests,
        )
    except Exception as exc:
        raise HTTPException(500, f"AI analysis failed: {exc}")
    return result


# ── Repo file tree (no content download) ─────────────────────────────────────

@router.get("/explore")
def explore_repo(
    repo_url: str,
    repo_token: Optional[str] = "",
    source_type: Optional[str] = "",
):
    """Return just the file tree of a repository — no content downloaded.
    Useful for the Repository Explorer UI before the user selects files."""
    url = repo_url.strip()
    stype = source_type or detect_source_type(url)

    try:
        tree = _get_tree(url, repo_token or "", stype)
    except Exception as exc:
        raise HTTPException(400, f"Could not fetch file tree: {exc}")

    return {"tree": tree, "source_type": stype, "total": len(tree)}


# ── Tree fetchers ─────────────────────────────────────────────────────────────

def _get_tree(url: str, token: str, source_type: str) -> list:
    if source_type == "github":
        return _github_tree(url, token)
    if source_type == "gitlab":
        return _gitlab_tree(url, token)
    if source_type == "bitbucket":
        return _bitbucket_tree(url, token)
    if source_type == "azure_devops":
        return _azure_tree(url, token)
    return []


def _gh_req(url: str, token: str):
    h = {"Accept": "application/vnd.github+json", "User-Agent": "QA-RAG-Platform"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def _github_tree(url: str, token: str) -> list:
    m = re.search(r"github\.com[:/]([^/]+)/([^/.\s]+)", url)
    if not m:
        return []
    owner, repo = m.group(1), m.group(2).removesuffix(".git")

    info = _gh_req(f"https://api.github.com/repos/{owner}/{repo}", token)
    branch = info.get("default_branch", "main")

    data = _gh_req(
        f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1",
        token,
    )
    return [
        {"path": item["path"], "kind": "dir" if item["type"] == "tree" else "file",
         "size": item.get("size", 0)}
        for item in data.get("tree", [])
    ]


def _gitlab_tree(url: str, token: str) -> list:
    m = re.search(r"gitlab\.com[:/](.+?)(?:\.git)?$", url)
    if not m:
        return []
    project = urllib.parse.quote(m.group(1).strip("/"), safe="")
    h = {"PRIVATE-TOKEN": token} if token else {}
    req = urllib.request.Request(
        f"https://gitlab.com/api/v4/projects/{project}/repository/tree?recursive=true&per_page=100",
        headers=h,
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        items = json.loads(r.read())
    return [{"path": i["path"], "kind": i["type"], "size": 0} for i in items]


def _bitbucket_tree(url: str, token: str) -> list:
    import base64
    m = re.search(r"bitbucket\.org[:/]([^/]+)/([^/.\s]+)", url)
    if not m:
        return []
    ws, repo = m.group(1), m.group(2).removesuffix(".git")
    h = {}
    if token:
        if ":" in token:
            h["Authorization"] = "Basic " + base64.b64encode(token.encode()).decode()
        else:
            h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"https://api.bitbucket.org/2.0/repositories/{ws}/{repo}/src?pagelen=100",
        headers=h,
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    return [{"path": v["path"], "kind": v["type"], "size": 0} for v in data.get("values", [])]


def _azure_tree(url: str, token: str) -> list:
    import base64
    # URL pattern: https://dev.azure.com/{org}/{project}/_git/{repo}
    m = re.search(r"dev\.azure\.com/([^/]+)/([^/]+)/_git/([^/?]+)", url)
    if not m:
        return []
    org, project, repo = m.group(1), m.group(2), m.group(3)
    creds = base64.b64encode(f":{token}".encode()).decode()
    h = {"Authorization": f"Basic {creds}"}
    api = f"https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}"
    req = urllib.request.Request(
        f"{api}/items?recursionLevel=full&api-version=7.1", headers=h
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    return [
        {"path": i.get("path", "").lstrip("/"),
         "kind": "dir" if i.get("isFolder") else "file",
         "size": i.get("contentMetadata", {}).get("encoding", 0)}
        for i in data.get("value", [])
    ]
