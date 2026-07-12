import fitz  # PyMuPDF
from typing import List, Dict, Any


def parse(content: bytes, filename: str) -> List[Dict[str, Any]]:
    doc = fitz.open(stream=content, filetype="pdf")
    pages = []
    for page_num in range(len(doc)):
        text = doc[page_num].get_text("text").strip()
        if not text:
            continue
        pages.append({
            "text": text,
            "metadata": {
                "filename": filename,
                "source": filename,
                "page": page_num + 1,
                "total_pages": len(doc),
            },
            "page": page_num + 1,
        })
    doc.close()
    return pages
