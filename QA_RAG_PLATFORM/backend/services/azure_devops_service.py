"""Azure DevOps PR auto-generation via Azure DevOps REST API 7.1 (pure stdlib)."""
from __future__ import annotations
import base64
import json
import re
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Tuple


def _headers(token: str) -> dict:
    creds = base64.b64encode(f":{token}".encode()).decode()
    return {"Authorization": f"Basic {creds}", "Content-Type": "application/json"}


def _api(method: str, url: str, token: str, body: Any = None) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=_headers(token))
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _parse_url(url: str) -> Tuple[str, str, str]:
    """Extract (org_url, project, repo) from an Azure DevOps git URL."""
    m = re.search(r"dev\.azure\.com/([^/]+)/([^/]+)/_git/([^/?#]+)", url)
    if m:
        return (
            f"https://dev.azure.com/{m.group(1)}",
            urllib.parse.quote(m.group(2)),
            urllib.parse.quote(m.group(3)),
        )
    raise ValueError(f"Cannot parse Azure DevOps URL: {url}")


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
    repo_url: str,
    organization: str = "",
    project: str = "",
    repo_name: str = "",
    files: List[Tuple[str, str]] = (),
    branch_name: str = "",
    pr_title: str = "",
    pr_body: str = "",
    base_branch: str = "main",
) -> Dict[str, Any]:
    import urllib.parse

    if repo_url.startswith("http"):
        org_url, proj, repo = _parse_url(repo_url)
    else:
        org_url = f"https://dev.azure.com/{organization}"
        proj = urllib.parse.quote(project)
        repo = urllib.parse.quote(repo_name)

    ver = "api-version=7.1"
    api = f"{org_url}/{proj}/_apis/git/repositories/{repo}"

    # Get base branch SHA
    refs_raw = _api("GET", f"{api}/refs?filter=heads/{base_branch}&{ver}", token)
    base_sha = refs_raw["value"][0]["objectId"]

    # Create branch
    _api("POST", f"{api}/refs?{ver}", token, [{
        "name": f"refs/heads/{branch_name}",
        "newObjectId": base_sha,
        "oldObjectId": "0000000000000000000000000000000000000000",
    }])

    # Push commit with all files
    _api("POST", f"{api}/pushes?{ver}", token, {
        "refUpdates": [{"name": f"refs/heads/{branch_name}", "oldObjectId": base_sha}],
        "commits": [{
            "comment": f"chore: {pr_title}",
            "changes": [
                {
                    "changeType": "add",
                    "item": {"path": f"/{path}"},
                    "newContent": {"content": content, "contentType": "rawtext"},
                }
                for path, content in files
            ],
        }],
    })

    # Open PR
    pr = _api("POST", f"{api}/pullrequests?{ver}", token, {
        "sourceRefName": f"refs/heads/{branch_name}",
        "targetRefName": f"refs/heads/{base_branch}",
        "title": pr_title,
        "description": pr_body,
    })

    pr_url = f"{org_url}/{proj}/_git/{repo}/pullrequest/{pr['pullRequestId']}"
    return {"pr_url": pr_url, "pr_number": pr["pullRequestId"], "branch": branch_name}


import urllib.parse  # noqa: E402 (needed by _parse_url)
