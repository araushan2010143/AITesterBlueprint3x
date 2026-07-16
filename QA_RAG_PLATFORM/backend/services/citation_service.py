"""
Citation service — formats retrieval results into structured source citations.

Every AI response should include citations so users can verify claims
against the original source documents. This prevents hallucination trust issues.

Citation structure:
  {
    "chunk_id":        str,
    "doc_id":          str,
    "filename":        str,
    "page":            int,
    "section":         str,   # first heading found in chunk text
    "excerpt":         str,   # first 200 chars of chunk text
    "score":           float, # retrieval relevance score
    "retrieved_at":    str,   # ISO-8601 UTC timestamp
    "connector_type":  str,   # "upload" | "jira" | "confluence" | "github"
  }

Confidence model:
  score >= 0.80  → HIGH (strong grounding)
  score >= 0.55  → MEDIUM (reasonable grounding)
  score <  0.55  → LOW (weak — trigger abstain warning)

ABSTAIN_THRESHOLD:
  If the best-scoring result < ABSTAIN_THRESHOLD, the answer should
  include a "low confidence" warning and prompt the user to ingest
  more relevant documents.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

ABSTAIN_THRESHOLD = 0.40   # below this, warn user and soften the answer
HIGH_CONFIDENCE   = 0.80
MEDIUM_CONFIDENCE = 0.55

_HEADING_RE = re.compile(r'^#{1,3}\s+(.+)$', re.MULTILINE)
_NEWLINE_RE = re.compile(r'\s+')


def _extract_section(text: str) -> str:
    """Return the first heading found in text, or the first sentence."""
    m = _HEADING_RE.search(text)
    if m:
        return m.group(1).strip()[:100]
    first_sentence = text.split(".")[0].strip()
    return first_sentence[:80] if first_sentence else ""


def _clean_excerpt(text: str, max_chars: int = 200) -> str:
    return _NEWLINE_RE.sub(" ", text).strip()[:max_chars]


def build_citations(raw_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Convert raw retrieval results into structured citation objects.

    Args:
        raw_results: List of dicts from hybrid_search() each with
                     {chunk_id, text, score, metadata: {...}}

    Returns:
        Sorted list of citation dicts (highest score first).
    """
    now = datetime.now(tz=timezone.utc).isoformat()
    citations = []

    for r in raw_results:
        meta = r.get("metadata", {})
        text = r.get("text", "")
        score = r.get("score", 0.0)

        # Determine confidence band
        if score >= HIGH_CONFIDENCE:
            confidence = "high"
        elif score >= MEDIUM_CONFIDENCE:
            confidence = "medium"
        else:
            confidence = "low"

        citations.append({
            "chunk_id":       r.get("chunk_id", ""),
            "doc_id":         meta.get("doc_id", ""),
            "filename":       meta.get("filename", "Unknown"),
            "page":           int(meta.get("page", 0)),
            "section":        _extract_section(text),
            "excerpt":        _clean_excerpt(text),
            "score":          round(score, 4),
            "confidence":     confidence,
            "retrieved_at":   now,
            "connector_type": meta.get("connector_type", "upload"),
            "team_id":        meta.get("team_id", ""),
            "document_type":  meta.get("document_type", ""),
            "module":         meta.get("module", ""),
        })

    # Sort by score descending
    citations.sort(key=lambda c: c["score"], reverse=True)
    return citations


def should_abstain(citations: List[Dict[str, Any]]) -> Tuple[bool, float]:
    """
    Returns (should_abstain, best_score).
    should_abstain = True when the knowledge base has no good match.
    """
    if not citations:
        return True, 0.0
    best = citations[0]["score"]
    return best < ABSTAIN_THRESHOLD, best


def abstain_message(query: str, best_score: float) -> str:
    return (
        f"I don't have enough information in the knowledge base to answer this confidently "
        f"(best match score: {best_score:.2f}, threshold: {ABSTAIN_THRESHOLD:.2f}). "
        f"To improve results, try ingesting documents related to: **{query[:120]}**. "
        f"You can upload via the Ingest page or connect Jira / Confluence."
    )


def format_answer_with_citations(
    answer: str,
    citations: List[Dict[str, Any]],
    query: str,
    top_n: int = 5,
) -> Dict[str, Any]:
    """
    Build the final response envelope that every AI answer should return.
    Includes the answer, citations, confidence assessment, and timestamps.
    """
    do_abstain, best_score = should_abstain(citations)
    top_citations = citations[:top_n]

    return {
        "answer": abstain_message(query, best_score) if do_abstain else answer,
        "abstained": do_abstain,
        "confidence": {
            "level":      "none" if do_abstain else ("high" if best_score >= HIGH_CONFIDENCE else ("medium" if best_score >= MEDIUM_CONFIDENCE else "low")),
            "best_score": round(best_score, 4),
            "threshold":  ABSTAIN_THRESHOLD,
        },
        "citations": top_citations,
        "citation_count": len(citations),
        "retrieved_at": datetime.now(tz=timezone.utc).isoformat(),
    }
