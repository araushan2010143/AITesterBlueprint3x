"""Markdown / PRD parser — extracts text, preserves heading structure."""
from __future__ import annotations
import os


def parse_markdown(path: str) -> tuple[str, dict]:
    filename = os.path.basename(path)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    metadata = {
        "source":   "markdown",
        "filename": filename,
        "path":     path,
    }
    return content, metadata
