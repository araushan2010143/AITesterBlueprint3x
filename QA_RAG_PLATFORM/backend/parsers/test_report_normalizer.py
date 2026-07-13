"""Auto-detect test report format and convert to flaky_agent text format."""
import json
from typing import List, Optional

from backend.parsers import junit_xml_parser, playwright_json_parser


def _looks_like_junit_xml(content: str) -> bool:
    stripped = content.lstrip()
    return stripped.startswith("<") and any(
        tag in stripped[:500]
        for tag in ("<testsuites", "<testsuite", "<?xml")
    )


def _looks_like_playwright_json(content: str) -> bool:
    try:
        data = json.loads(content)
        return isinstance(data, dict) and "suites" in data and "stats" in data
    except Exception:
        return False


def normalize(content: str, filename: str = "", build_label: str = "Build-1") -> str:
    """
    Auto-detect format of test report content and return normalised text.
    Supports: JUnit XML, Playwright JSON reporter, plain text (pass-through).
    """
    stripped = content.strip()
    if not stripped:
        raise ValueError("Empty content")

    if _looks_like_junit_xml(stripped):
        return junit_xml_parser.parse(stripped, build_label=build_label)

    if _looks_like_playwright_json(stripped):
        return playwright_json_parser.parse(stripped, build_label=build_label)

    # Plain text / CSV / custom format — pass through as-is
    return stripped


def normalize_multi(contents: List[str], filenames: Optional[List[str]] = None) -> str:
    """Normalise multiple report files and merge as sequential builds."""
    filenames = filenames or [""] * len(contents)
    parts: List[str] = []
    for i, (content, fname) in enumerate(zip(contents, filenames), 1):
        try:
            parts.append(normalize(content, filename=fname, build_label=f"Build-{i}"))
        except Exception as e:
            parts.append(f"=== Build-{i} ({fname}): parse error — {e} ===")
    return "\n\n".join(parts)
