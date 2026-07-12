import re
from typing import List, Dict, Any


def parse(content: bytes, filename: str, ext: str) -> List[Dict[str, Any]]:
    text = content.decode("utf-8", errors="replace")
    lang = {"ts": "typescript", "js": "javascript", "py": "python", "java": "java"}.get(ext, ext)

    if ext in ("ts", "js"):
        return _parse_playwright_jest(text, filename, lang)
    elif ext == "py":
        return _parse_python_tests(text, filename)
    else:
        return _parse_generic_code(text, filename, lang)


def _parse_playwright_jest(text: str, filename: str, lang: str) -> List[Dict[str, Any]]:
    """Extract describe/test blocks from Playwright/Jest/Cypress."""
    pages = []
    # Split on describe or test blocks
    blocks = re.split(r"(?=(?:describe|test|it)\s*\()", text)
    for i, block in enumerate(blocks):
        block = block.strip()
        if not block:
            continue
        name_match = re.match(r'(?:describe|test|it)\s*\(["\`\'](.*?)["\`\']', block)
        name = name_match.group(1) if name_match else f"Block {i+1}"
        pages.append({
            "text": block[:3000],
            "metadata": {
                "filename": filename,
                "source": filename,
                "language": lang,
                "test_name": name,
                "document_type": "automation",
                "page": i + 1,
            },
            "page": i + 1,
        })
    return pages or [{"text": text[:4000], "metadata": {"filename": filename, "language": lang}, "page": 1}]


def _parse_python_tests(text: str, filename: str) -> List[Dict[str, Any]]:
    """Extract pytest/unittest test methods."""
    pages = []
    # Split on class or def test_ lines
    blocks = re.split(r"(?=(?:class\s+Test|def\s+test_))", text)
    for i, block in enumerate(blocks):
        block = block.strip()
        if not block:
            continue
        name_match = re.match(r"(?:class|def)\s+(\w+)", block)
        name = name_match.group(1) if name_match else f"Block {i+1}"
        pages.append({
            "text": block[:3000],
            "metadata": {
                "filename": filename,
                "source": filename,
                "language": "python",
                "test_name": name,
                "document_type": "automation",
                "page": i + 1,
            },
            "page": i + 1,
        })
    return pages or [{"text": text[:4000], "metadata": {"filename": filename, "language": "python"}, "page": 1}]


def _parse_generic_code(text: str, filename: str, lang: str) -> List[Dict[str, Any]]:
    lines = text.split("\n")
    batch_size = 100
    pages = []
    for i in range(0, len(lines), batch_size):
        batch = "\n".join(lines[i : i + batch_size])
        pages.append({
            "text": batch,
            "metadata": {"filename": filename, "source": filename, "language": lang, "page": (i // batch_size) + 1},
            "page": (i // batch_size) + 1,
        })
    return pages
