"""
Company coding standards RAG service.

Stores standards documents in SQLite, retrieves relevant sections via BM25
on every migration, and injects them into the Stage 4 (POM) and Stage 5
(Playwright synthesis) prompts.

No Pinecone needed — standards are small (a few documents), BM25 is fast enough.
"""
import json
import logging
import re
from typing import List, Optional

from rank_bm25 import BM25Okapi
from sqlmodel import Session, select

from backend.database.db import engine
from backend.models.migration_standards import MigrationStandard

logger = logging.getLogger(__name__)

_MIN_CHUNK_LEN = 60    # ignore very short paragraphs
_MAX_CHUNKS = 60       # cap per standard to avoid BM25 memory blowup
_RETRIEVE_TOP_K = 4    # chunks to inject per query


# ── Text chunking ──────────────────────────────────────────────────────────────

def _chunk(text: str) -> List[str]:
    """Split on blank lines; filter short or empty paragraphs."""
    paras = [p.strip() for p in re.split(r"\n{2,}", text)]
    return [p for p in paras if len(p) >= _MIN_CHUNK_LEN][:_MAX_CHUNKS]


# ── Save / delete ──────────────────────────────────────────────────────────────

def save_standard(name: str, filename: str, content: str) -> MigrationStandard:
    chunks = _chunk(content)
    with Session(engine) as s:
        std = MigrationStandard(
            name=name,
            filename=filename,
            content=content,
            chunks_json=json.dumps(chunks),
        )
        s.add(std)
        s.commit()
        s.refresh(std)
    logger.info("Saved standard '%s' — %d chunk(s)", name, len(chunks))
    return std


def delete_standard(std_id: str) -> bool:
    with Session(engine) as s:
        std = s.get(MigrationStandard, std_id)
        if not std:
            return False
        s.delete(std)
        s.commit()
    return True


def list_standards() -> List[dict]:
    with Session(engine) as s:
        rows = s.exec(select(MigrationStandard)).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "filename": r.filename,
            "chunk_count": len(json.loads(r.chunks_json)) if r.chunks_json else 0,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


# ── BM25 retrieval ─────────────────────────────────────────────────────────────

def retrieve(query: str, top_k: int = _RETRIEVE_TOP_K) -> str:
    """
    Return the most relevant standard chunks for `query` as a single string.
    Returns empty string when no standards are uploaded.
    """
    with Session(engine) as s:
        rows = s.exec(select(MigrationStandard)).all()

    if not rows:
        return ""

    all_chunks: List[str] = []
    for row in rows:
        if row.chunks_json:
            all_chunks.extend(json.loads(row.chunks_json))
        else:
            all_chunks.extend(_chunk(row.content))

    if not all_chunks:
        return ""

    tokenized = [c.lower().split() for c in all_chunks]
    bm25 = BM25Okapi(tokenized)
    scores = bm25.get_scores(query.lower().split())

    top_idx = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:top_k]
    relevant = [all_chunks[i] for i in top_idx if scores[i] > 0.01]

    if not relevant:
        return ""

    return (
        "\n\nCOMPANY CODING STANDARDS (apply these to the generated code):\n"
        + "\n\n".join(f"• {c}" for c in relevant)
    )
