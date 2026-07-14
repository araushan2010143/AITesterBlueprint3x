"""
GitHub PR auto-generation service.

Uses the GitHub REST API via urllib — no extra package dependency.

Flow:
  1. Verify the token has repo write access
  2. Get the default branch SHA (base commit)
  3. Create a new branch: migration/<job_id_prefix>
  4. Upload each file (PUT /contents) using the branch ref
  5. Open a pull request from that branch → base branch
  Returns: { pr_url, branch, files_pushed }
"""
import base64
import json
import logging
import re
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_GH_API = "https://api.github.com"


# ── Low-level helpers ──────────────────────────────────────────────────────────

def _req(
    method: str,
    path: str,
    token: str,
    body: Optional[dict] = None,
) -> Tuple[int, dict]:
    url = f"{_GH_API}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "QA-RAG-Migration/3.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body_bytes = exc.read()
        try:
            err = json.loads(body_bytes)
        except Exception:
            err = {"message": body_bytes.decode("utf-8", errors="replace")}
        return exc.code, err


def _parse_repo(repo: str) -> Tuple[str, str]:
    """Accept 'owner/repo' or full GitHub URL."""
    m = re.search(r"github\.com[:/]([^/]+)/([^/.]+)", repo)
    if m:
        return m.group(1), m.group(2).rstrip(".git")
    parts = repo.strip("/").split("/")
    if len(parts) >= 2:
        return parts[-2], parts[-1]
    raise ValueError(f"Cannot parse repo: {repo!r}")


# ── Public API ─────────────────────────────────────────────────────────────────

def create_pr(
    token: str,
    repo: str,          # "owner/repo" or full GitHub URL
    files: Dict[str, str],   # { "path/in/repo.ts": "file content", ... }
    branch_name: str,
    pr_title: str,
    pr_body: str,
    base_branch: str = "main",
) -> Dict[str, Any]:
    """
    Push `files` to a new branch and open a PR.
    Returns { pr_url, branch, files_pushed, error? }
    """
    owner, repo_name = _parse_repo(repo)
    base = f"/repos/{owner}/{repo_name}"

    # 1. Get base branch SHA
    status, data = _req("GET", f"{base}/branches/{base_branch}", token)
    if status != 200:
        # try master
        status, data = _req("GET", f"{base}/branches/master", token)
        base_branch = "master"
    if status != 200:
        raise RuntimeError(f"Cannot access {owner}/{repo_name}: {data.get('message','')}")
    base_sha = data["commit"]["sha"]

    # 2. Create branch
    status, data = _req("POST", f"{base}/git/refs", token, {
        "ref": f"refs/heads/{branch_name}",
        "sha": base_sha,
    })
    if status not in (201, 422):   # 422 = branch already exists
        raise RuntimeError(f"Failed to create branch: {data.get('message','')}")

    # 3. Push each file
    pushed: List[str] = []
    for file_path, content in files.items():
        encoded = base64.b64encode(content.encode("utf-8")).decode()

        # Check if file exists (to get its SHA for update)
        _, existing = _req("GET", f"{base}/contents/{file_path}?ref={branch_name}", token)
        payload: Dict[str, Any] = {
            "message": f"chore(migration): add {file_path}",
            "content": encoded,
            "branch": branch_name,
        }
        if isinstance(existing, dict) and "sha" in existing:
            payload["sha"] = existing["sha"]

        status, _ = _req("PUT", f"{base}/contents/{file_path}", token, payload)
        if status in (200, 201):
            pushed.append(file_path)
        else:
            logger.warning("Failed to push %s: status %d", file_path, status)

    # 4. Create PR
    status, pr_data = _req("POST", f"{base}/pulls", token, {
        "title": pr_title,
        "body": pr_body,
        "head": branch_name,
        "base": base_branch,
    })
    if status not in (200, 201):
        raise RuntimeError(f"Failed to create PR: {pr_data.get('message','')}")

    return {
        "pr_url": pr_data["html_url"],
        "pr_number": pr_data["number"],
        "branch": branch_name,
        "files_pushed": pushed,
    }


def build_pr_files(job_results: List[Dict[str, Any]], prefix: str = "playwright") -> Dict[str, str]:
    """
    Build the file dict for create_pr() from migration job results.
    Puts generated files under `playwright/<stem>/` to avoid polluting the root.
    """
    from pathlib import Path

    files: Dict[str, str] = {}
    for fr in job_results:
        if fr.get("status") != "done":
            continue
        res = fr.get("result", {})
        stem = Path(fr["file"]).stem

        if res.get("spec_ts"):
            files[f"{prefix}/{stem}/spec.ts"] = res["spec_ts"]

        pom = res.get("page_objects") or {}
        if pom.get("base_page"):
            files[f"{prefix}/{stem}/pages/BasePage.ts"] = pom["base_page"]
        for po in pom.get("page_objects", []):
            fn = po.get("filename", "Page.ts")
            files[f"{prefix}/{stem}/pages/{fn}"] = po.get("content", "")

    return files


def build_pr_body(job_id: str, results: List[Dict[str, Any]]) -> str:
    done = [r for r in results if r.get("status") == "done"]
    failed = [r for r in results if r.get("status") == "failed"]
    avg_conf = (
        round(sum(r["result"].get("confidence_score", 0) for r in done) / len(done))
        if done else 0
    )
    lines = [
        "## 🤖 Automated Migration — QA RAG Platform V3",
        "",
        f"**Job:** `{job_id}`  ",
        f"**Files migrated:** {len(done)} succeeded, {len(failed)} failed  ",
        f"**Average confidence:** {avg_conf}/100",
        "",
        "### Files included",
    ]
    for r in done:
        conf = r["result"].get("confidence_score", 0)
        sa = r["result"].get("source_analysis", {})
        lines.append(f"- `{r['file']}` — {sa.get('language','?')} → Playwright TS (confidence: {conf})")
    if failed:
        lines.append("\n### Failed files")
        for r in failed:
            lines.append(f"- `{r['file']}` — {r.get('error','unknown error')[:80]}")
    lines += [
        "",
        "### Review checklist",
        "- [ ] Locator selectors verified against the live app",
        "- [ ] Test data externalized to fixtures",
        "- [ ] CI/CD pipeline updated to run Playwright",
        "- [ ] Delete legacy test files once Playwright suite is green",
        "",
        "_Generated by [QA RAG Platform](https://qa-rag-platform.vercel.app) — Migration Studio V3_",
    ]
    return "\n".join(lines)
