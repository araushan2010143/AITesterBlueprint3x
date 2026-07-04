"""PDF loading and text chunking using PyMuPDF + LangChain splitter."""
from pathlib import Path
from typing import List, Dict, Any

import fitz  # PyMuPDF
from langchain.text_splitter import RecursiveCharacterTextSplitter


def load_pdfs(data_dir: str) -> tuple[List[Dict[str, Any]], dict]:
    """
    Scan data_dir for PDFs and extract page-level text.
    Returns (pages, summary) where summary has total docs/pages.
    """
    pages: List[Dict[str, Any]] = []
    pdf_dir = Path(data_dir)

    if not pdf_dir.exists():
        pdf_dir.mkdir(parents=True, exist_ok=True)
        return pages, {"documents": 0, "total_pages": 0, "files": []}

    pdf_files = sorted(pdf_dir.glob("*.pdf"))
    file_summary = []

    for pdf_path in pdf_files:
        try:
            doc = fitz.open(str(pdf_path))
            total_pages = len(doc)
            file_summary.append({
                "filename": pdf_path.name,
                "doc_id": pdf_path.stem,
                "total_pages": total_pages
            })

            for page_num in range(total_pages):
                page = doc[page_num]
                text = page.get_text("text").strip()
                if not text:
                    continue

                pages.append({
                    "text": text,
                    "metadata": {
                        "filename": pdf_path.name,
                        "page": page_num + 1,
                        "doc_id": pdf_path.stem,
                        "total_pages": total_pages,
                        "source": str(pdf_path)
                    }
                })

            doc.close()
        except Exception as exc:
            print(f"[pdf_loader] Error loading {pdf_path.name}: {exc}")

    summary = {
        "documents": len(pdf_files),
        "total_pages": sum(f["total_pages"] for f in file_summary),
        "files": file_summary
    }
    return pages, summary


def chunk_documents(
    pages: List[Dict[str, Any]],
    chunk_size: int = 800,
    chunk_overlap: int = 150
) -> List[Dict[str, Any]]:
    """Split page texts into overlapping chunks."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""]
    )

    chunks: List[Dict[str, Any]] = []
    chunk_index = 0

    for page_doc in pages:
        text_chunks = splitter.split_text(page_doc["text"])
        for i, chunk_text in enumerate(text_chunks):
            stripped = chunk_text.strip()
            if not stripped:
                continue
            chunks.append({
                "id": f"chunk_{chunk_index:04d}",
                "text": stripped,
                "metadata": {
                    **page_doc["metadata"],
                    "chunk_index": chunk_index,
                    "chunk_in_page": i
                }
            })
            chunk_index += 1

    return chunks
