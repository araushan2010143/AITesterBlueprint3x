"""Code parser — extracts text from source files, detects language."""
from __future__ import annotations
import os

_EXTENSION_MAP = {
    ".java": "java", ".kt": "kotlin", ".scala": "scala",
    ".ts": "typescript", ".tsx": "typescript", ".js": "javascript",
    ".py": "python", ".rb": "ruby", ".go": "go",
    ".cs": "csharp", ".cpp": "cpp", ".c": "c",
}


def parse_code_file(path: str, repo: str = "", framework: str = "") -> tuple[str, dict]:
    """
    Returns (file_content, metadata).
    Auto-detects language from extension.
    """
    ext      = os.path.splitext(path)[1].lower()
    language = _EXTENSION_MAP.get(ext, "unknown")
    filename = os.path.basename(path)

    with open(path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    metadata = {
        "source":    "code",
        "filename":  filename,
        "path":      path,
        "language":  language,
        "repo":      repo,
        "framework": framework or _guess_framework(content, language),
    }
    return content, metadata


def _guess_framework(content: str, language: str) -> str:
    if "playwright" in content.lower():
        return "playwright"
    if "selenium" in content.lower() or "webdriver" in content.lower():
        return "selenium"
    if language == "python" and "pytest" in content.lower():
        return "pytest"
    return ""
