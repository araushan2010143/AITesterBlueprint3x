"""Three chunking strategies: recursive, semantic, fixed."""
import re
import uuid
from typing import List, Dict, Any
from backend.config import get_settings

settings = get_settings()


def recursive_chunk(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    """LangChain-style recursive character text splitter."""
    separators = ["\n\n", "\n", ". ", "! ", "? ", " ", ""]
    for sep in separators:
        if sep == "":
            # Character-level split
            chunks = []
            start = 0
            while start < len(text):
                end = min(start + chunk_size, len(text))
                chunks.append(text[start:end])
                start += chunk_size - chunk_overlap
            return [c for c in chunks if c.strip()]

        parts = text.split(sep)
        merged = []
        current = ""
        for part in parts:
            candidate = (current + sep + part) if current else part
            if len(candidate) <= chunk_size:
                current = candidate
            else:
                if current:
                    merged.append(current)
                if len(part) > chunk_size:
                    break  # need finer separator
                current = part
        if current:
            merged.append(current)

        if merged and all(len(c) <= chunk_size for c in merged):
            # Add overlap
            result = []
            for i, chunk in enumerate(merged):
                if i > 0 and chunk_overlap > 0:
                    prev = merged[i - 1]
                    overlap_text = prev[-chunk_overlap:] if len(prev) > chunk_overlap else prev
                    chunk = overlap_text + " " + chunk
                    chunk = chunk[:chunk_size]
                result.append(chunk)
            return [c for c in result if c.strip()]

    return [text]


def semantic_chunk(text: str, chunk_size: int) -> List[str]:
    """Split by sentences, group into semantic windows."""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks = []
    current = ""
    for sentence in sentences:
        if not sentence.strip():
            continue
        candidate = (current + " " + sentence) if current else sentence
        if len(candidate) <= chunk_size:
            current = candidate
        else:
            if current:
                chunks.append(current.strip())
            current = sentence
    if current:
        chunks.append(current.strip())
    return [c for c in chunks if c.strip()]


def fixed_chunk(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    """Simple fixed-size chunking."""
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        start += chunk_size - chunk_overlap
    return [c for c in chunks if c.strip()]


def chunk_pages(
    pages: List[Dict[str, Any]],
    chunk_size: int = None,
    chunk_overlap: int = None,
    strategy: str = "recursive",
) -> List[Dict[str, Any]]:
    """
    Chunk parsed pages into vector-ready chunks.
    Returns list of {id, text, metadata, chunk_index, page}.
    """
    chunk_size = chunk_size or settings.max_chunk_size
    chunk_overlap = chunk_overlap or settings.chunk_overlap
    all_chunks = []
    idx = 0

    for page in pages:
        text = page.get("text", "").strip()
        if not text:
            continue
        meta = page.get("metadata", {})
        page_num = page.get("page", 1)

        if strategy == "semantic":
            texts = semantic_chunk(text, chunk_size)
        elif strategy == "fixed":
            texts = fixed_chunk(text, chunk_size, chunk_overlap)
        else:
            texts = recursive_chunk(text, chunk_size, chunk_overlap)

        for chunk_text in texts:
            if not chunk_text.strip():
                continue
            all_chunks.append({
                "id": str(uuid.uuid4()),
                "text": chunk_text.strip(),
                "metadata": {**meta, "chunk_index": idx, "chunk_strategy": strategy},
                "chunk_index": idx,
                "page": page_num,
            })
            idx += 1

    return all_chunks
