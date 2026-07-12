from bs4 import BeautifulSoup
from typing import List, Dict, Any


def parse(content: bytes, filename: str) -> List[Dict[str, Any]]:
    soup = BeautifulSoup(content, "lxml")

    # Remove scripts and styles
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    title = soup.title.string.strip() if soup.title else filename

    # Extract by section headers
    pages = []
    sections: List[str] = []
    current: List[str] = []

    for element in soup.find_all(["h1", "h2", "h3", "p", "li", "td", "th", "pre", "code"]):
        text = element.get_text(separator=" ", strip=True)
        if not text:
            continue
        if element.name in ("h1", "h2"):
            if current:
                sections.append("\n".join(current))
                current = []
        current.append(text)

    if current:
        sections.append("\n".join(current))

    for i, section in enumerate(sections):
        pages.append({
            "text": section,
            "metadata": {
                "filename": filename,
                "source": filename,
                "title": title,
                "section": i + 1,
                "page": i + 1,
            },
            "page": i + 1,
        })

    if not pages:
        text = soup.get_text(separator="\n", strip=True)
        pages = [{"text": text, "metadata": {"filename": filename, "source": filename}, "page": 1}]

    return pages
