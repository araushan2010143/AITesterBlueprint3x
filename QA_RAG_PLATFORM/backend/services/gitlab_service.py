"""GitLab MR auto-generation via GitLab REST API v4 (pure stdlib — no deps)."""
from __future__ import annotations
import json
import re
import urllib.request
import urllib.parse
from typing import Any, Dict, List, Tuple


def _api(method: str, url: str, token: str, body: Any = None) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"PRIVATE-TOKEN": token, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _resolve(gitlab_url: str, repo: str, token: str) -> Tuple[str, str]:
    """Return (base_api, project_id_str) given a repo slug or full URL."""
    gitlab_url = gitlab_url.rstrip("/")

    if repo.startswith("http"):
        from urllib.parse import urlparse
        p = urlparse(repo)
        gitlab_url = f"{p.scheme}://{p.netloc}"
        repo = p.path.strip("/").removesuffix(".git")

    encoded = urllib.parse.quote(repo, safe="")
    base = f"{gitlab_url}/api/v4"
    proj = _api("GET", f"{base}/projects/{encoded}", token)
    return base, str(proj["id"])


def build_mr_files(results: list) -> List[Tuple[str, str]]:
    """Same shape as github_service.build_pr_files."""
    from pathlib import Path
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


def create_mr(
    token: str,
    repo: str,
    files: List[Tuple[str, str]],
    branch_name: str,
    mr_title: str,
    mr_body: str,
    base_branch: str = "main",
    gitlab_url: str = "https://gitlab.com",
) -> Dict[str, Any]:
    base, pid = _resolve(gitlab_url, repo, token)
    proj_api = f"{base}/projects/{pid}"

    # Get base branch SHA
    b = urllib.parse.quote(base_branch, safe="")
    branch_info = _api("GET", f"{proj_api}/repository/branches/{b}", token)
    sha = branch_info["commit"]["id"]

    # Create branch
    try:
        _api("POST", f"{proj_api}/repository/branches", token,
             {"branch": branch_name, "ref": sha})
    except Exception:
        pass  # may already exist from a prior attempt

    # Commit all files in one call
    actions = [
        {"action": "create", "file_path": path, "content": content, "encoding": "text"}
        for path, content in files
    ]
    _api("POST", f"{proj_api}/repository/commits", token, {
        "branch": branch_name,
        "commit_message": f"chore: {mr_title}",
        "actions": actions,
    })

    # Open MR
    mr = _api("POST", f"{proj_api}/merge_requests", token, {
        "source_branch": branch_name,
        "target_branch": base_branch,
        "title": mr_title,
        "description": mr_body,
        "remove_source_branch": True,
    })

    return {"mr_url": mr["web_url"], "mr_number": mr["iid"], "branch": branch_name}
