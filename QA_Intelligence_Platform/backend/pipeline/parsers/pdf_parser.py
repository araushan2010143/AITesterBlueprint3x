"""PDF parser — extracts text page by page using pypdf."""
from __future__ import annotations


def parse_pdf(path: str) -> tuple[str, dict]:
    """
    Returns (full_text, metadata).
    Metadata includes page_count, filename, source='pdf'.
    """
    import pypdf
    import os

    filename = os.path.basename(path)
    reader = pypdf.PdfReader(path)
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        pages.append(f"[Page {i+1}]\n{text}")

    full_text = "\n\n".join(pages)
    metadata  = {
        "source":     "pdf",
        "filename":   filename,
        "path":       path,
        "page_count": len(reader.pages),
    }
    return full_text, metadata
