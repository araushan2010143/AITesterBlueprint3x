"""
CodeChangeAgent — correlates git commit diffs with defects.

Answers:
  - "Which commits are likely responsible for this bug?"
  - "Does this PR diff introduce regression risk?"
  - "What changed in the codebase around the time this bug was reported?"

Input:
  task.query     — bug description or "review this diff for risk"
  task.node_id   — Jira key or commit SHA (optional)
  task.extra     — {
                     "diff_text":     "...",          # raw git diff (if already fetched)
                     "commit_sha":    "abc123",
                     "pr_number":     42,
                     "repo":          "owner/repo",
                     "github_token":  "ghp_...",
                     "changed_files": ["src/auth.py"],
                     "commit_message": "...",
                     "author":        "alice",
                     "mode":          "bug_correlation | risk_review | defect_intro"
                   }

Output schema:
  {
    "mode":                 "bug_correlation",
    "commit_sha":           "abc123",
    "pr_number":            42,
    "risk_level":           "critical | high | medium | low",
    "confidence":           0.87,
    "defect_correlation": {
      "likely_introduced":  true,
      "correlation_evidence": "...",
      "affected_functions": ["authenticate()", "validate_token()"]
    },
    "risk_factors": [
      {"factor": "Auth logic modified without test update", "severity": "high"}
    ],
    "changed_areas": [
      {"file": "src/auth.py", "change_type": "modified", "risk": "high"}
    ],
    "recommended_tests":    ["Auth E2E suite", "2FA regression"],
    "requires_security_review": false,
    "summary":              "..."
  }
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from backend.agents.base_agent import BaseAgent, extract_json
from backend.agents.schemas import AgentTask

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a senior software engineer and QA expert specialising in code change risk analysis.

You are given:
1. GIT DIFF or PR DIFF — the actual code changes (or a description of them).
2. BUG INFORMATION — a bug description, symptoms, or Jira key.
3. RAG CONTEXT — similar past bugs and their associated commits from the knowledge base.
4. ANALYSIS MODE:
   - bug_correlation: determine if this diff likely introduced the reported bug
   - risk_review: assess the regression risk this diff introduces
   - defect_intro: identify potential defects hidden in the diff

Return a JSON object:

  mode                      — bug_correlation | risk_review | defect_intro
  commit_sha                — the commit SHA being analysed, or ""
  pr_number                 — PR number if applicable, or null
  risk_level                — critical | high | medium | low
  confidence                — 0.0 to 1.0 overall confidence
  defect_correlation        — object with:
    likely_introduced       — boolean: true if this commit likely caused the bug
    correlation_evidence    — 2-3 sentences of supporting evidence
    affected_functions      — list of function/method names that changed
  risk_factors              — list of {"factor", "severity"} objects
                              severity: high | medium | low
  changed_areas             — list of {"file", "change_type", "risk"} objects
                              change_type: added | modified | deleted
                              risk: high | medium | low
  recommended_tests         — list of test areas/suites to run after this change
  requires_security_review  — boolean: true if diff touches auth/crypto/permissions
  summary                   — 2-3 sentence executive summary of findings

Risk factors to look for:
  - Auth / session / permissions logic modified (always high risk)
  - Database migrations or schema changes
  - Changes without corresponding test file updates
  - Large diff (>200 lines in a single file)
  - Changes to shared utilities used across many modules
  - Removal of null/boundary checks
  - Hardcoded credentials or connection strings in diff

Return ONLY valid JSON — no prose, no code fences.
"""


def fetch_github_diff(
    token: str,
    repo: str,
    commit_sha: Optional[str] = None,
    pr_number: Optional[int] = None,
) -> str:
    """
    Fetch a commit diff or PR diff from GitHub.
    Returns the raw diff text (truncated to 6000 chars to fit context).
    """
    import urllib.request, urllib.error
    _GH_API = "https://api.github.com"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3.diff",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if pr_number:
        url = f"{_GH_API}/repos/{repo}/pulls/{pr_number}"
    elif commit_sha:
        url = f"{_GH_API}/repos/{repo}/commits/{commit_sha}"
    else:
        return ""

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return raw[:8000] + ("...(truncated)" if len(raw) > 8000 else "")
    except urllib.error.HTTPError as exc:
        logger.warning("GitHub diff fetch failed: %s", exc)
        return ""


class CodeChangeAgent(BaseAgent):
    name = "code_change_agent"
    description = "Correlates git commit diffs with defects and assesses regression risk"

    def build_prompt(
        self,
        task: AgentTask,
        rag_context: str,
        graph_context: str,
    ) -> Tuple[str, str]:
        parts = []
        extra = task.extra or {}
        mode = extra.get("mode", "bug_correlation")
        parts.append(f"ANALYSIS MODE: {mode}")

        if task.node_id:
            parts.append(f"BUG/COMMIT ID: {task.node_id}")
        if task.query:
            parts.append(f"BUG DESCRIPTION / CONTEXT:\n{task.query}")

        # Fetch diff from GitHub if not already provided
        diff_text = extra.get("diff_text", "")
        if not diff_text and extra.get("github_token") and extra.get("repo"):
            diff_text = fetch_github_diff(
                token=extra["github_token"],
                repo=extra["repo"],
                commit_sha=extra.get("commit_sha"),
                pr_number=extra.get("pr_number"),
            )

        if diff_text:
            parts.append(f"GIT DIFF:\n{diff_text}")
        elif extra.get("commit_sha"):
            parts.append(f"COMMIT SHA: {extra['commit_sha']}")

        if extra.get("commit_message"):
            parts.append(f"COMMIT MESSAGE:\n{extra['commit_message']}")
        if extra.get("author"):
            parts.append(f"AUTHOR: {extra['author']}")
        if extra.get("changed_files"):
            parts.append(f"CHANGED FILES:\n" + "\n".join(f"  - {f}" for f in extra["changed_files"]))
        if extra.get("pr_number"):
            parts.append(f"PR NUMBER: #{extra['pr_number']}")

        if rag_context:
            parts.append(f"SIMILAR PAST BUGS AND COMMITS:\n{rag_context}")

        if not diff_text and not task.query:
            parts.append("No diff or bug info provided. Return minimal JSON with risk_level: low, confidence: 0.")

        return _SYSTEM_PROMPT, "\n\n".join(parts)

    def parse_output(self, raw: str, task: AgentTask) -> Dict[str, Any]:
        extra = task.extra or {}
        parsed = extract_json(raw)
        if not isinstance(parsed, dict):
            parsed = {}
        parsed.setdefault("mode",                     extra.get("mode", "bug_correlation"))
        parsed.setdefault("commit_sha",               extra.get("commit_sha", ""))
        parsed.setdefault("pr_number",                extra.get("pr_number"))
        parsed.setdefault("risk_level",               "medium")
        parsed.setdefault("confidence",               0.0)
        parsed.setdefault("defect_correlation", {
            "likely_introduced":    False,
            "correlation_evidence": "",
            "affected_functions":   [],
        })
        parsed.setdefault("risk_factors",             [])
        parsed.setdefault("changed_areas",            [])
        parsed.setdefault("recommended_tests",        [])
        parsed.setdefault("requires_security_review", False)
        parsed.setdefault("summary",                  "")
        return parsed
