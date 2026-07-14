"""
TypeScript output validator — Stage 6 of the V3 migration pipeline.

Two modes:
  1. tsc (subprocess) — accurate, requires Node.js on the host
  2. Structural heuristic — always available, catches common LLM mistakes
Both return the same result shape so the caller doesn't need to branch.
"""
import json
import os
import re
import subprocess
import tempfile
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_TSC_AVAILABLE: Optional[bool] = None


def _tsc_available() -> bool:
    global _TSC_AVAILABLE
    if _TSC_AVAILABLE is None:
        try:
            r = subprocess.run(["node", "--version"], capture_output=True, timeout=5)
            _TSC_AVAILABLE = r.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            _TSC_AVAILABLE = False
    return _TSC_AVAILABLE


_TSCONFIG = {
    "compilerOptions": {
        "target": "ES2020",
        "module": "commonjs",
        "strict": True,
        "esModuleInterop": True,
        "skipLibCheck": True,
        "noEmit": True,
        "baseUrl": ".",
    },
    "include": ["./**/*.ts"],
}


def _run_tsc(spec_ts: str, base_page: str, page_objects: List[Dict]) -> Dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmpdir:
        pages_dir = os.path.join(tmpdir, "pages")
        os.makedirs(pages_dir, exist_ok=True)

        with open(os.path.join(tmpdir, "tsconfig.json"), "w") as f:
            json.dump(_TSCONFIG, f)
        with open(os.path.join(tmpdir, "spec.ts"), "w") as f:
            f.write(spec_ts)
        if base_page:
            with open(os.path.join(pages_dir, "BasePage.ts"), "w") as f:
                f.write(base_page)
        for po in page_objects:
            fn = po.get("filename", "Page.ts")
            with open(os.path.join(pages_dir, fn), "w") as f:
                f.write(po.get("content", ""))

        try:
            # Install @playwright/test types silently if missing
            subprocess.run(
                ["npm", "install", "--save-dev", "@playwright/test", "--prefix", tmpdir],
                capture_output=True, timeout=60,
            )
        except Exception:
            pass  # tsc with skipLibCheck will still catch most errors

        try:
            result = subprocess.run(
                ["npx", "tsc", "--project", "tsconfig.json"],
                capture_output=True, text=True, cwd=tmpdir, timeout=60,
            )
            errors = []
            for line in (result.stdout + result.stderr).splitlines():
                if "error TS" in line:
                    # Strip tmpdir path for cleaner output
                    clean = line.replace(tmpdir + os.sep, "").strip()
                    errors.append(clean)

            return {
                "method": "tsc",
                "passed": result.returncode == 0,
                "error_count": len(errors),
                "errors": errors[:20],
            }
        except subprocess.TimeoutExpired:
            return {"method": "tsc", "passed": None, "error_count": 0, "errors": ["tsc timed out"]}


# ── Structural / heuristic checker ─────────────────────────────────────────────

def _heuristic_check(spec_ts: str, base_page: str, page_objects: List[Dict]) -> Dict[str, Any]:
    issues: List[Dict[str, str]] = []

    # 1. Playwright test import
    if spec_ts and "from '@playwright/test'" not in spec_ts:
        issues.append({"severity": "error", "message": "Missing `import { test, expect } from '@playwright/test'`"})

    # 2. test.describe() wrapping
    if spec_ts and "test.describe(" not in spec_ts and "test(" not in spec_ts:
        issues.append({"severity": "warning", "message": "No test() or test.describe() found in spec.ts"})

    # 3. Bracket balance per file
    for label, code in [("spec.ts", spec_ts), ("BasePage.ts", base_page)] + [
        (po.get("filename", "?"), po.get("content", "")) for po in page_objects
    ]:
        if not code:
            continue
        opens = code.count("{") + code.count("(") + code.count("[")
        closes = code.count("}") + code.count(")") + code.count("]")
        if abs(opens - closes) > 3:
            issues.append({"severity": "warning", "message": f"{label}: possible unclosed brackets ({opens} open, {closes} close)"})

    # 4. waitForTimeout / sleep (bad patterns Playwright docs warn against)
    for label, code in [("spec.ts", spec_ts)]:
        if code and ("waitForTimeout" in code or "sleep(" in code):
            issues.append({"severity": "warning", "message": f"{label}: contains waitForTimeout/sleep — replace with Playwright auto-waiting"})

    # 5. Hardcoded credentials
    if spec_ts and re.search(r'(password|secret|token)\s*[:=]\s*["\'][^"\']{4,}', spec_ts, re.IGNORECASE):
        issues.append({"severity": "info", "message": "spec.ts may contain hardcoded credentials — consider environment variables"})

    # 6. POM classes exported
    for po in page_objects:
        code = po.get("content", "")
        fn = po.get("filename", "?")
        if code and "export class" not in code:
            issues.append({"severity": "error", "message": f"{fn}: class is not exported"})

    # 7. BasePage not extended
    for po in page_objects:
        code = po.get("content", "")
        fn = po.get("filename", "?")
        if code and "extends BasePage" not in code and fn != "BasePage.ts":
            issues.append({"severity": "info", "message": f"{fn}: does not extend BasePage"})

    # 8. TODO stubs left by LLM
    todo_count = spec_ts.count("// TODO") + spec_ts.count("// FIXME") if spec_ts else 0
    if todo_count > 0:
        issues.append({"severity": "info", "message": f"spec.ts has {todo_count} TODO/FIXME comment(s) to resolve"})

    errors = [i for i in issues if i["severity"] == "error"]
    return {
        "method": "heuristic",
        "passed": len(errors) == 0,
        "error_count": len(errors),
        "errors": [i["message"] for i in issues],
        "issues": issues,
    }


# ── Public API ─────────────────────────────────────────────────────────────────

def validate(
    spec_ts: str,
    base_page: str,
    page_objects: List[Dict],
) -> Dict[str, Any]:
    """
    Validate generated TypeScript output.
    Returns: { method, passed, error_count, errors, issues? }
    """
    if _tsc_available():
        try:
            return _run_tsc(spec_ts, base_page, page_objects)
        except Exception as exc:
            logger.warning("tsc validation failed unexpectedly: %s", exc)

    return _heuristic_check(spec_ts, base_page, page_objects)
