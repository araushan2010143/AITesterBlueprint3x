"""Bitbucket Cloud PR auto-generation via Bitbucket REST API v2 (pure stdlib)."""
from __future__ import annotations
import base64
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Tuple


def _headers(token: str) -> dict:
    """token may be 'username:app_password' (Basic) or a bare OAuth Bearer token."""
    if ":" in token:
        creds = base64.b64encode(token.encode()).decode()
        return {"Authorization": f"Basic {creds}", "Content-Type": "application/json"}
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _api(method: str, url: str, token: str, body: Any = None) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=_headers(token))
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _parse_url(url: str) -> Tuple[str, str]:
    """Return (workspace, repo_slug) from a Bitbucket URL."""
    m = re.search(r"bitbucket\.org[:/]([^/]+)/([^/.\s]+)", url)
    if m:
        return m.group(1), m.group(2).removesuffix(".git")
    raise ValueError(f"Cannot parse Bitbucket URL: {url}")


def build_pr_files(results: list) -> List[Tuple[str, str]]:
    files: List[Tuple[str, str]] = []
    for fr in results:
        if fr.get("status") != "done":
            continue
        res = fr["result"]
        stem = Path(fr["file"]).stem
        if res.get("spec_ts"):
            files.append((f"playwright/{stem}/spec.ts", res["spec_ts"]))
        pom = res.get("page_objects") or {}
        if pom.get("base_page"):
            files.append((f"playwright/{stem}/pages/BasePage.ts", pom["base_page"]))
        for po in pom.get("page_objects", []):
            files.append((f"playwright/{stem}/pages/{po['filename']}", po["content"]))
    return files


def create_pr(
    token: str,
    repo_url: str = "",
    workspace: str = "",
    repo_slug: str = "",
    files: List[Tuple[str, str]] = (),
    branch_name: str = "",
    pr_title: str = "",
    pr_body: str = "",
    base_branch: str = "main",
) -> Dict[str, Any]:
    if repo_url.startswith("http"):
        workspace, repo_slug = _parse_url(repo_url)

    base = f"https://api.bitbucket.org/2.0/repositories/{workspace}/{repo_slug}"

    # Get base branch commit hash
    safe_branch = urllib.parse.quote(base_branch, safe="")
    bi = _api("GET", f"{base}/refs/branches/{safe_branch}", token)
    base_hash = bi["target"]["hash"]

    # Create feature branch
    _api("POST", f"{base}/refs/branches", token, {
        "name": branch_name,
        "target": {"hash": base_hash},
    })

    # Commit each file via the /src endpoint (multipart form)
    h_raw = _headers(token)
    for file_path, content in files:
        boundary = "MigBoundary1234567890"
        parts = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{file_path}"\r\n\r\n'
            f"{content}\r\n"
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="message"\r\n\r\n'
            f"chore: add {file_path}\r\n"
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="branch"\r\n\r\n'
            f"{branch_name}\r\n"
            f"--{boundary}--\r\n"
        )
        body_bytes = parts.encode("utf-8")
        src_headers = {
            "Authorization": h_raw["Authorization"],
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        }
        req = urllib.request.Request(
            f"{base}/src", data=body_bytes, method="POST", headers=src_headers
        )
        with urllib.request.urlopen(req, timeout=30):
            pass  # expect 201

    # Open PR
    pr = _api("POST", f"{base}/pullrequests", token, {
        "title": pr_title,
        "description": pr_body,
        "source": {"branch": {"name": branch_name}},
        "destination": {"branch": {"name": base_branch}},
        "close_source_branch": True,
    })

    return {
        "pr_url": pr["links"]["html"]["href"],
        "pr_number": pr["id"],
        "branch": branch_name,
    }
