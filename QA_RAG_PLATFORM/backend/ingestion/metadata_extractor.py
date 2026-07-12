"""Use Groq to auto-extract structured QA metadata from document content."""
import json
from typing import Dict, Any
from backend.config import get_settings
from groq import Groq

settings = get_settings()

METADATA_PROMPT = """Analyze this document excerpt and extract QA metadata in JSON format.

Return ONLY valid JSON with these keys (use null for unknown fields):
{
  "document_type": one of ["test_cases", "requirements", "automation", "report", "api_docs", "defects", "release_notes", "general"],
  "module": "e.g. Login, Payment, Cart",
  "feature": "e.g. Authentication, Checkout Flow",
  "priority": one of ["High", "Medium", "Low", null],
  "author": "author name if mentioned",
  "release": "version or sprint if mentioned e.g. v2.1, Sprint 22",
  "tags": ["list", "of", "relevant", "tags"],
  "automation_status": one of ["Automated", "Manual", "Partial", null],
  "requirement_ids": ["REQ-101", "REQ-102"],
  "summary": "one-sentence summary of what this document contains"
}"""


def extract_metadata(text_sample: str) -> Dict[str, Any]:
    """Extract structured metadata from the first ~2000 chars of a document."""
    if not settings.groq_api_key:
        return _default_metadata()

    try:
        client = Groq(api_key=settings.groq_api_key)
        response = client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": METADATA_PROMPT},
                {"role": "user", "content": f"Document excerpt:\n\n{text_sample[:2000]}"},
            ],
            temperature=0.1,
            max_tokens=512,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content
        return json.loads(raw)
    except Exception:
        return _default_metadata()


def _default_metadata() -> Dict[str, Any]:
    return {
        "document_type": "general",
        "module": None,
        "feature": None,
        "priority": None,
        "author": None,
        "release": None,
        "tags": [],
        "automation_status": None,
        "requirement_ids": [],
        "summary": "",
    }
