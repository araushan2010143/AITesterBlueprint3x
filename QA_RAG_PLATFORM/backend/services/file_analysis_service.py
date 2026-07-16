"""AI per-file analysis — LLM-powered deep dive on a single test file."""
from __future__ import annotations
import json
import logging
from typing import Any, Dict

from backend.llm.router import get_router

logger = logging.getLogger(__name__)

_PROMPT = """You are a senior QA architect reviewing a single test file before Playwright migration.

Analyse the file and return a JSON object with EXACTLY these keys:

{{
  "summary": "1-2 sentence plain-English description of what this test does",
  "test_flow": ["step 1", "step 2", ...],   // ordered test steps inferred from code (max 8)
  "dependencies": ["ClassName", "util.py", ...],  // imports / page objects this file depends on
  "migration_confidence": "high|medium|low",
  "migration_confidence_score": 0-100,
  "risks": ["specific risk 1", ...],   // concrete migration obstacles (max 5)
  "quick_wins": ["what migrates trivially", ...],  // things that need no manual work (max 3)
  "strategy": "one paragraph: recommended migration sequence / approach for this specific file"
}}

Rules:
- migration_confidence = "high" if score >= 75, "medium" if >= 50, "low" otherwise
- Risks must be specific to the actual code (e.g. "Line 34 uses driver.executeScript — needs Playwright evaluate()")
- Do not mention Selenium/WebDriver generically — be file-specific
- Return ONLY the JSON object, no markdown fences

FILE: {filename}
CONTEXT: language={language}, type={file_type}, complexity={complexity}, tests={tests}
CONTENT:
{content}
"""


def analyze_file(
    filename: str,
    content: str,
    language: str = "Unknown",
    file_type: str = "test",
    complexity: str = "medium",
    tests: int = 0,
) -> Dict[str, Any]:
    prompt = _PROMPT.format(
        filename=filename,
        language=language,
        file_type=file_type,
        complexity=complexity,
        tests=tests,
        content=content[:5_000],   # cap to keep within context
    )

    raw = get_router().chat(
        [
            {"role": "system", "content": "You are a QA migration expert. Always return valid JSON only."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=800,
        json_mode=True,
    )

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        # Strip markdown fences if the LLM added them despite instructions
        import re
        clean = re.sub(r"^```(?:json)?\n?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
        try:
            result = json.loads(clean)
        except Exception:
            logger.warning("file_analysis: JSON parse failed, returning raw text")
            result = {
                "summary": raw[:400],
                "test_flow": [],
                "dependencies": [],
                "migration_confidence": "medium",
                "migration_confidence_score": 50,
                "risks": ["Could not parse structured analysis"],
                "quick_wins": [],
                "strategy": "",
            }

    # Ensure required keys exist with defaults
    defaults: Dict[str, Any] = {
        "summary": "",
        "test_flow": [],
        "dependencies": [],
        "migration_confidence": "medium",
        "migration_confidence_score": 50,
        "risks": [],
        "quick_wins": [],
        "strategy": "",
    }
    for k, v in defaults.items():
        result.setdefault(k, v)

    return result
