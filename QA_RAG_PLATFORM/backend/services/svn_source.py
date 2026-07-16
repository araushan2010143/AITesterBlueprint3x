"""
SVN and Perforce source integrations.

SVN:   extracts files via `svn export` (requires svn CLI) or HTTP SVN WebDAV.
P4:    extracts files via `p4 print` (requires Perforce CLI p4).

Both fall back to a descriptive error when the required CLI is not installed.
"""
import logging
import os
import shutil
import subprocess
import tempfile
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


def _cli_available(cmd: str) -> bool:
    return shutil.which(cmd) is not None


# ── SVN ───────────────────────────────────────────────────────────────────────

def _svn_available() -> bool:
    return _cli_available("svn")


def extract_svn_files(
    repo_url: str,
    revision: str = "HEAD",
    username: Optional[str] = None,
    password: Optional[str] = None,
    path_filter: Optional[str] = None,
) -> Tuple[List[Dict], Optional[str]]:
    """
    Export files from an SVN repository URL.

    Supports:
      svn://server/repo
      svn+ssh://server/repo
      http[s]://server/svn/repo
      file:///local/path

    Returns (file_list, error_message).
    Each file dict: {"filename": str, "content": str, "size": int}
    """
    if not _svn_available():
        return [], (
            "SVN CLI not found. Install subversion: `apt-get install subversion` "
            "or `brew install subversion`."
        )

    tmpdir = tempfile.mkdtemp(prefix="qa_svn_")
    try:
        cmd = ["svn", "export", "--no-auth-cache", "--non-interactive",
               f"-r{revision}", repo_url, tmpdir, "--force"]
        if username:
            cmd += ["--username", username]
        if password:
            cmd += ["--password", password]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            return [], f"svn export failed: {result.stderr[:400]}"

        files = []
        for root, dirs, filenames in os.walk(tmpdir):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for fname in filenames:
                abs_path = os.path.join(root, fname)
                rel_path = os.path.relpath(abs_path, tmpdir)
                if path_filter and not rel_path.startswith(path_filter.lstrip("/")):
                    continue
                try:
                    with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()
                    size = os.path.getsize(abs_path)
                    files.append({"filename": rel_path, "content": content[:60_000], "size": size})
                except Exception:
                    pass
        return files, None
    except subprocess.TimeoutExpired:
        return [], "SVN export timed out after 120 seconds"
    except Exception as exc:
        logger.error("SVN extract error: %s", exc)
        return [], str(exc)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def list_svn_files(
    repo_url: str,
    revision: str = "HEAD",
    username: Optional[str] = None,
    password: Optional[str] = None,
) -> Tuple[List[str], Optional[str]]:
    """List files in an SVN repo without exporting them."""
    if not _svn_available():
        return [], "SVN CLI not available"
    cmd = ["svn", "list", "--depth", "infinity", "--no-auth-cache",
           "--non-interactive", f"-r{revision}", repo_url]
    if username:
        cmd += ["--username", username]
    if password:
        cmd += ["--password", password]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if r.returncode != 0:
            return [], r.stderr[:300]
        paths = [l.strip() for l in r.stdout.splitlines() if l.strip() and not l.endswith("/")]
        return paths, None
    except Exception as exc:
        return [], str(exc)


# ── Perforce ──────────────────────────────────────────────────────────────────

def _p4_available() -> bool:
    return _cli_available("p4")


def extract_p4_files(
    depot_path: str,
    p4port: Optional[str] = None,
    p4user: Optional[str] = None,
    p4client: Optional[str] = None,
    path_filter: Optional[str] = None,
) -> Tuple[List[Dict], Optional[str]]:
    """
    Extract files from a Perforce depot path using `p4 print`.

    depot_path examples:
      //depot/main/tests/...
      //myproject/release/automation/...

    Required env vars (or pass explicitly):
      P4PORT  — e.g. perforce:1666
      P4USER  — Perforce username
      P4CLIENT — workspace client name
    """
    if not _p4_available():
        return [], (
            "Perforce CLI (p4) not found. Install from "
            "https://www.perforce.com/downloads/helix-command-line-client-p4"
        )

    env = os.environ.copy()
    if p4port:
        env["P4PORT"] = p4port
    if p4user:
        env["P4USER"] = p4user
    if p4client:
        env["P4CLIENT"] = p4client

    if not depot_path.endswith("..."):
        depot_path = depot_path.rstrip("/") + "/..."

    # List matching files
    try:
        r = subprocess.run(
            ["p4", "files", depot_path],
            capture_output=True, text=True, timeout=30, env=env,
        )
        if r.returncode != 0:
            return [], f"p4 files failed: {r.stderr[:300]}"

        depot_files = []
        for line in r.stdout.splitlines():
            parts = line.split("#")
            if parts:
                fpath = parts[0].strip()
                if path_filter and path_filter not in fpath:
                    continue
                depot_files.append(fpath)
    except Exception as exc:
        return [], str(exc)

    files = []
    for dp in depot_files[:200]:  # cap at 200 files per call
        try:
            r = subprocess.run(
                ["p4", "print", "-q", dp],
                capture_output=True, text=True, timeout=15, env=env,
            )
            if r.returncode == 0 and r.stdout:
                fname = dp.split("/")[-1]
                files.append({"filename": dp, "content": r.stdout[:60_000], "size": len(r.stdout)})
        except Exception:
            pass

    return files, None


def is_svn_url(url: str) -> bool:
    return url.startswith(("svn://", "svn+ssh://")) or (
        url.startswith(("http://", "https://")) and "/svn/" in url
    )


def is_p4_depot(path: str) -> bool:
    return path.startswith("//")
