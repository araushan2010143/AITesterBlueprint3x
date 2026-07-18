"""
Source-specific semantic chunker.

Rule: chunk size and boundaries are determined by the source type, NOT a fixed token count.

| Source          | Chunk unit                  | Why                                    |
|-----------------|----------------------------|----------------------------------------|
| Java/TS/Python  | Function or class (AST)    | Preserves semantic meaning of code     |
| PDF / Word      | 400–600 tokens, heading    | Avoids mid-sentence cuts               |
| Meeting notes   | Speaker turn block         | Preserves speaker context              |
| Log files       | 100–150 lines              | Keeps correlated events together       |
| CSV             | One row = one chunk        | Each row is an atomic data point       |
| Excel (tests)   | One row = one test case    | One test case = one retrieval unit     |
| JIRA            | One issue = one chunk      | Issue is atomic                        |
| Markdown / PRD  | Heading-based sections     | Sections have self-contained meaning   |
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Literal


SourceType = Literal[
    "code", "pdf", "docx", "markdown", "csv",
    "excel", "jira", "logs", "meeting_notes", "text",
]


@dataclass
class Chunk:
    text: str
    chunk_index: int
    source_type: SourceType
    metadata: dict = field(default_factory=dict)


def chunk_document(
    text: str,
    source_type: SourceType,
    base_metadata: dict | None = None,
) -> list[Chunk]:
    """Dispatch to the correct chunker for this source type."""
    meta = base_metadata or {}
    if source_type == "code":
        return _chunk_code(text, meta)
    elif source_type in ("pdf", "docx", "text"):
        return _chunk_prose(text, meta, max_tokens=500, overlap_tokens=50)
    elif source_type == "markdown":
        return _chunk_markdown(text, meta)
    elif source_type == "logs":
        return _chunk_logs(text, meta, lines_per_chunk=100)
    elif source_type == "meeting_notes":
        return _chunk_meeting_notes(text, meta)
    elif source_type in ("csv", "excel", "jira"):
        # These are pre-chunked row-by-row by their parsers
        return [Chunk(text=text, chunk_index=0, source_type=source_type, metadata=meta)]
    else:
        return _chunk_prose(text, meta, max_tokens=500, overlap_tokens=50)


# ── Code chunker (function/class boundaries) ──────────────────────────────────

def _chunk_code(text: str, meta: dict) -> list[Chunk]:
    """
    Split code by function/class definitions.
    Phase 1: regex-based split on def/class/function keywords.
    Phase 2: AST-based via tree-sitter (more accurate).
    """
    pattern = re.compile(
        r"(?=^\s*(?:public|private|protected|static|async)?\s*"
        r"(?:def |class |function |void |int |String |async function ))",
        re.MULTILINE,
    )
    parts = pattern.split(text)
    chunks = []
    for i, part in enumerate(parts):
        part = part.strip()
        if len(part) < 20:
            continue
        chunks.append(Chunk(
            text=part,
            chunk_index=i,
            source_type="code",
            metadata={**meta, "chunk_type": "function_or_class"},
        ))
    return chunks or [Chunk(text=text, chunk_index=0, source_type="code", metadata=meta)]


# ── Prose chunker (PDF, Word, plain text) ─────────────────────────────────────

_AVG_CHARS_PER_TOKEN = 4


def _chunk_prose(
    text: str,
    meta: dict,
    max_tokens: int = 500,
    overlap_tokens: int = 50,
) -> list[Chunk]:
    max_chars = max_tokens * _AVG_CHARS_PER_TOKEN
    overlap   = overlap_tokens * _AVG_CHARS_PER_TOKEN
    words = text.split()
    chunks = []
    i = 0
    ci = 0
    while i < len(words):
        window = []
        length = 0
        j = i
        while j < len(words) and length + len(words[j]) + 1 <= max_chars:
            window.append(words[j])
            length += len(words[j]) + 1
            j += 1
        chunk_text = " ".join(window).strip()
        if chunk_text:
            chunks.append(Chunk(text=chunk_text, chunk_index=ci, source_type="pdf", metadata=meta))
            ci += 1
        if j >= len(words):
            break  # consumed all words — stop to avoid infinite loop on last chunk
        overlap_words = max(1, overlap // 5)
        i = max(j - overlap_words, i + 1)  # always advance i to guarantee progress
    return chunks


# ── Markdown / PRD chunker (heading-based) ────────────────────────────────────

def _chunk_markdown(text: str, meta: dict) -> list[Chunk]:
    sections = re.split(r"(?m)^#{1,3} ", text)
    chunks = []
    for i, section in enumerate(sections):
        section = section.strip()
        if len(section) < 30:
            continue
        chunks.append(Chunk(
            text=section,
            chunk_index=i,
            source_type="markdown",
            metadata={**meta, "chunk_type": "section"},
        ))
    return chunks or [Chunk(text=text, chunk_index=0, source_type="markdown", metadata=meta)]


# ── Log chunker (100-150 lines) ───────────────────────────────────────────────

def _chunk_logs(text: str, meta: dict, lines_per_chunk: int = 100) -> list[Chunk]:
    lines = text.splitlines()
    chunks = []
    for i in range(0, len(lines), lines_per_chunk):
        block = "\n".join(lines[i: i + lines_per_chunk]).strip()
        if block:
            chunks.append(Chunk(
                text=block,
                chunk_index=i // lines_per_chunk,
                source_type="logs",
                metadata={**meta, "start_line": i + 1, "end_line": i + lines_per_chunk},
            ))
    return chunks


# ── Meeting notes chunker (speaker turns) ─────────────────────────────────────

def _chunk_meeting_notes(text: str, meta: dict) -> list[Chunk]:
    turns = re.split(r"(?m)^[A-Z][a-z]+(?: [A-Z][a-z]+)?:", text)
    chunks = []
    for i, turn in enumerate(turns):
        turn = turn.strip()
        if len(turn) < 20:
            continue
        chunks.append(Chunk(
            text=turn,
            chunk_index=i,
            source_type="meeting_notes",
            metadata={**meta, "chunk_type": "speaker_turn"},
        ))
    return chunks or [Chunk(text=text, chunk_index=0, source_type="meeting_notes", metadata=meta)]
