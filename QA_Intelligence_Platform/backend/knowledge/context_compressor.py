"""Context compressor — trims retrieved chunks to the LLM token budget."""
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .retrieval_engine import RetrievedChunk

_AVG_CHARS_PER_TOKEN = 4  # rough estimate; good enough for budget trimming


class ContextCompressor:
    def __init__(self, max_tokens: int = 6000):
        self.max_tokens = max_tokens

    def compress(self, chunks: list["RetrievedChunk"]) -> list["RetrievedChunk"]:
        """Keep highest-scoring chunks that fit within max_tokens budget."""
        budget = self.max_tokens * _AVG_CHARS_PER_TOKEN
        selected: list["RetrievedChunk"] = []
        used = 0
        for chunk in chunks:
            chunk_len = len(chunk.text)
            if used + chunk_len > budget:
                break
            selected.append(chunk)
            used += chunk_len
        return selected
