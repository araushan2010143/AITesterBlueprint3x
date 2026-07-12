import re
from typing import List, Dict, Any


def parse(content: bytes, filename: str) -> List[Dict[str, Any]]:
    text = content.decode("utf-8", errors="replace")
    # Split on H1/H2 headings to create logical pages
    sections = re.split(r"\n(?=#{1,2}\s)", text)
    pages = []
    for i, section in enumerate(sections):
        section = section.strip()
        if not section:
            continue
        # Extract heading as title
        heading_match = re.match(r"^#{1,2}\s+(.+)", section)
        heading = heading_match.group(1) if heading_match else f"Section {i+1}"
        pages.append({
            "text": section,
            "metadata": {
                "filename": filename,
                "source": filename,
                "heading": heading,
                "page": i + 1,
            },
            "page": i + 1,
        })
    return pages or [{"text": text, "metadata": {"filename": filename, "source": filename}, "page": 1}]
