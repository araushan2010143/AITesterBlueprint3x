"""AI Repository Summary — LLM-generated project brief from scan results."""
from __future__ import annotations
from typing import Any, Dict

from backend.llm.router import get_router


_PROMPT = """You are a senior QA architect. Based on the project scan below, write a concise repository brief.

**Output format (Markdown, ≤400 words):**
## Overview
One-sentence description of what this test suite does.

## Testing Pattern
Identify the primary pattern: Page Object Model / BDD / Keyword-Driven / Data-Driven / hybrid.

## Migration Complexity
Rate as **Low / Medium / High** with 1-sentence rationale.

## Key Risks
3-5 bullet points: locator fragility, hardcoded waits, dependency on non-Playwright APIs, etc.

## Recommended Migration Order
List files in the order they should be migrated (foundational utilities first, complex specs last).

## Quick Wins
3 files that will migrate cleanly with high confidence (state filenames if available).

---
PROJECT SCAN DATA:
{scan_json}
"""


def generate_summary(scan_result: Dict[str, Any]) -> str:
    import json

    # Trim file_details to save tokens — include only filename + complexity + test_count
    compact = {k: v for k, v in scan_result.items() if k != "file_details"}
    compact["files_sample"] = [
        {"name": f.get("name"), "complexity": f.get("complexity"), "tests": f.get("test_count", 0)}
        for f in (scan_result.get("file_details") or [])[:20]
    ]

    prompt = _PROMPT.format(scan_json=json.dumps(compact, indent=2))

    response = get_router().chat([
        {"role": "system", "content": "You are a senior QA architect writing a concise migration brief."},
        {"role": "user", "content": prompt},
    ], max_tokens=600, json_mode=False)

    return response.strip()
