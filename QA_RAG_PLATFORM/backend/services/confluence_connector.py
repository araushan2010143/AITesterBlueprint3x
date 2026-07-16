"""
Confluence REST API connector.

Fetches pages and blog posts from Confluence Cloud spaces and converts them
to plain text for RAG ingestion. Handles nested pages recursively.

Authentication: Basic auth with email + API token (same Atlassian account as Jira).

Storage format notes:
  - Confluence stores pages in XHTML "storage format".
  - We use a lightweight regex/string approach to strip HTML without requiring
    an HTML parser dependency. For Sprint 5, replace with BeautifulSoup.
"""
from __future__ import annotations

import base64
import json
import logging
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, List, Optional

logger = logging.getLogger(__name__)

MAX_RESULTS_PER_PAGE = 50
DEFAULT_PAGE_DELAY_S = 0.05

# HTML tag stripper
_HTML_TAG_RE = re.compile(r'<[^>]+>', re.DOTALL)
_MULTI_SPACE_RE = re.compile(r'[ \t]{2,}')
_MULTI_NEWLINE_RE = re.compile(r'\n{3,}')
_AC_IMAGE_RE = re.compile(r'<ac:image[^>]*>.*?</ac:image>', re.DOTALL | re.IGNORECASE)
_AC_STRUCTURED_MACRO_RE = re.compile(r'<ac:structured-macro[^>]*>.*?</ac:structured-macro>', re.DOTALL | re.IGNORECASE)


def _html_to_text(html: str) -> str:
    """
    Lightweight HTML → plain text without BeautifulSoup.
    Handles Confluence's XHTML storage format.
    """
    if not html:
        return ""
    # Remove Confluence-specific macro blocks and images first
    text = _AC_IMAGE_RE.sub(" ", html)
    text = _AC_STRUCTURED_MACRO_RE.sub(" ", text)
    # Convert common block elements to newlines
    text = re.sub(r'<(?:p|br|div|li|h[1-6]|tr|/table)[^>]*>', '\n', text, flags=re.IGNORECASE)
    # Strip remaining tags
    text = _HTML_TAG_RE.sub(' ', text)
    # Decode common HTML entities
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>') \
               .replace('&quot;', '"').replace('&apos;', "'").replace('&nbsp;', ' ')
    # Normalize whitespace
    text = _MULTI_SPACE_RE.sub(' ', text)
    text = _MULTI_NEWLINE_RE.sub('\n\n', text)
    return text.strip()


@dataclass
class ConfluencePage:
    page_id: str
    title: str
    space_key: str
    space_name: str
    body_text: str
    version: int
    created: str
    updated: str
    author: str
    url: str
    parent_id: Optional[str] = None
    ancestors: List[str] = field(default_factory=list)  # titles
    labels: List[str] = field(default_factory=list)

    def to_text(self) -> str:
        breadcrumb = " > ".join(self.ancestors + [self.title]) if self.ancestors else self.title
        parts = [
            f"CONFLUENCE PAGE: {self.page_id}",
            f"Space: {self.space_name} ({self.space_key})",
            f"Title: {self.title}",
            f"Path: {breadcrumb}",
        ]
        if self.labels:
            parts.append(f"Labels: {', '.join(self.labels)}")
        parts.extend([
            f"Author: {self.author}",
            f"Created: {self.created}",
            f"Updated: {self.updated}",
            f"URL: {self.url}",
            f"\n{self.body_text}",
        ])
        return "\n".join(parts)

    def to_metadata(self, connector_id: str, team_id: Optional[str]) -> Dict[str, Any]:
        return {
            "source": "confluence",
            "connector_type": "confluence",
            "connector_id": connector_id,
            "confluence_page_id": self.page_id,
            "space_key": self.space_key,
            "filename": f"CONFLUENCE_{self.space_key}_{self.page_id}.txt",
            "document_type": "wiki",
            "team_id": team_id or "",
            "created_at": self.created,
            "updated_at": self.updated,
            "url": self.url,
        }


class ConfluenceConnector:
    """
    Confluence Cloud REST API v1 client.

    Usage:
        conn = ConfluenceConnector("https://myorg.atlassian.net", "user@example.com", "ATATT3x...")
        for page in conn.iter_space_pages(["DS", "QA"]):
            text = page.to_text()
    """

    def __init__(
        self,
        base_url: str,
        email: str,
        api_token: str,
        page_delay_s: float = DEFAULT_PAGE_DELAY_S,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._auth = self._make_basic_auth(email, api_token)
        self.page_delay_s = page_delay_s

    @staticmethod
    def _make_basic_auth(email: str, api_token: str) -> str:
        creds = f"{email}:{api_token}"
        return "Basic " + base64.b64encode(creds.encode()).decode()

    def _get(self, path: str, params: Optional[Dict] = None) -> Any:
        url = f"{self.base_url}/wiki/rest/api{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={
            "Authorization": self._auth,
            "Accept": "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            raise RuntimeError(f"Confluence API {e.code} on {path}: {body[:300]}") from e

    def test_connection(self) -> Dict[str, str]:
        data = self._get("/user/current")
        return {
            "account_id": data.get("accountId", ""),
            "display_name": data.get("displayName", ""),
            "email": data.get("email", ""),
        }

    def list_spaces(self) -> List[Dict[str, str]]:
        data = self._get("/space", {"type": "global", "limit": "200"})
        return [
            {"key": s["key"], "name": s["name"], "id": s["id"]}
            for s in data.get("results", [])
        ]

    def iter_space_pages(
        self,
        space_keys: List[str],
        include_blog: bool = False,
    ) -> Iterator[ConfluencePage]:
        """Yield ConfluencePage for every page in the given spaces."""
        content_types = ["page"]
        if include_blog:
            content_types.append("blogpost")

        for space_key in space_keys:
            # Get space name
            try:
                space_data = self._get(f"/space/{space_key}")
                space_name = space_data.get("name", space_key)
            except RuntimeError:
                space_name = space_key

            for content_type in content_types:
                yield from self._iter_pages_in_space(space_key, space_name, content_type)

    def _iter_pages_in_space(
        self,
        space_key: str,
        space_name: str,
        content_type: str,
    ) -> Iterator[ConfluencePage]:
        start = 0
        while True:
            data = self._get("/content", {
                "spaceKey": space_key,
                "type": content_type,
                "status": "current",
                "start": start,
                "limit": MAX_RESULTS_PER_PAGE,
                "expand": "body.storage,version,history,ancestors,metadata.labels,space",
            })
            results = data.get("results", [])
            if not results:
                break

            for item in results:
                page = _parse_page(item, space_key, space_name, self.base_url)
                if page:
                    yield page

            if "next" not in data.get("_links", {}):
                break
            start += len(results)
            time.sleep(self.page_delay_s)

    def get_page(self, page_id: str) -> Optional[ConfluencePage]:
        try:
            raw = self._get(f"/content/{page_id}", {
                "expand": "body.storage,version,history,ancestors,metadata.labels,space",
            })
            space_key = raw.get("space", {}).get("key", "")
            space_name = raw.get("space", {}).get("name", space_key)
            return _parse_page(raw, space_key, space_name, self.base_url)
        except RuntimeError:
            return None


def _parse_page(
    raw: Dict[str, Any],
    space_key: str,
    space_name: str,
    base_url: str,
) -> Optional[ConfluencePage]:
    try:
        body_html = raw.get("body", {}).get("storage", {}).get("value", "")
        body_text = _html_to_text(body_html)
        if not body_text.strip():
            return None  # Skip empty pages

        history = raw.get("history", {})
        created_by = history.get("createdBy", {}).get("displayName", "Unknown") if history else "Unknown"
        created_date = history.get("createdDate", "") if history else ""

        version = raw.get("version", {})
        updated_date = version.get("when", "") if version else ""

        ancestors = raw.get("ancestors", [])
        ancestor_titles = [a.get("title", "") for a in ancestors if a.get("title")]

        labels = []
        labels_meta = raw.get("metadata", {}).get("labels", {}).get("results", [])
        labels = [lbl.get("name", "") for lbl in labels_meta if lbl.get("name")]

        parent_id = ancestors[-1].get("id") if ancestors else None

        page_url = f"{base_url}/wiki{raw.get('_links', {}).get('webui', '')}"

        return ConfluencePage(
            page_id=raw["id"],
            title=raw.get("title", "Untitled"),
            space_key=space_key,
            space_name=space_name,
            body_text=body_text,
            version=version.get("number", 1) if version else 1,
            created=created_date,
            updated=updated_date,
            author=created_by,
            url=page_url,
            parent_id=parent_id,
            ancestors=ancestor_titles,
            labels=labels,
        )
    except Exception as exc:
        logger.warning("Failed to parse Confluence page %s: %s", raw.get("id", "?"), exc)
        return None
