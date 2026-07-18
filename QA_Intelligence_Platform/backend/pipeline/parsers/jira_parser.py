"""JIRA parser — fetches one issue from JIRA REST API, returns text + metadata."""
from __future__ import annotations


def parse_jira_issue(issue_key: str) -> tuple[str, dict]:
    """
    Fetch a JIRA issue and return (text_representation, metadata).
    One issue = one chunk (atomic unit).
    """
    import httpx
    from config import get_settings
    s = get_settings()

    if not s.jira_url:
        raise RuntimeError("JIRA_URL not configured")

    url  = f"{s.jira_url}/rest/api/3/issue/{issue_key}"
    auth = (s.jira_email, s.jira_api_token)

    response = httpx.get(url, auth=auth, timeout=15)
    response.raise_for_status()
    data = response.json()

    fields  = data.get("fields", {})
    summary = fields.get("summary", "")
    desc    = _extract_description(fields.get("description"))
    issue_type = fields.get("issuetype", {}).get("name", "")
    priority   = (fields.get("priority") or {}).get("name", "")
    status     = (fields.get("status") or {}).get("name", "")
    assignee   = (fields.get("assignee") or {}).get("displayName", "")
    sprint     = _extract_sprint(fields)
    labels     = fields.get("labels", [])

    text = f"[{issue_key}] {summary}\n\nType: {issue_type}\nStatus: {status}\n\n{desc}"

    metadata = {
        "source":     "jira",
        "jira":       issue_key,
        "issue_type": issue_type,
        "priority":   priority,
        "status":     status,
        "owner":      assignee,
        "sprint":     sprint,
        "labels":     ",".join(labels),
    }
    return text, metadata


def _extract_description(desc_field) -> str:
    if not desc_field:
        return ""
    if isinstance(desc_field, str):
        return desc_field
    # Atlassian Document Format
    parts = []
    for block in desc_field.get("content", []):
        for inline in block.get("content", []):
            parts.append(inline.get("text", ""))
    return " ".join(parts)


def _extract_sprint(fields: dict) -> str:
    sprints = fields.get("customfield_10020")
    if sprints and isinstance(sprints, list):
        return sprints[-1].get("name", "")
    return ""
