"""
Playwright test execution sandbox.

Modes:
  validate  — TypeScript compilation only (npx tsc --noEmit), instant
  dry_run   — npx playwright test --list, discovers test blocks without a browser
  execute   — full Playwright run (requires a live target URL)

Results always include: passed, failed, skipped, total, tests[], duration_ms.
"""
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Sandbox templates ─────────────────────────────────────────────────────────

_PLAYWRIGHT_CONFIG = """\
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  use: { headless: true, screenshot: 'only-on-failure' },
  reporter: [['json', { outputFile: 'results.json' }]],
});
"""

_PACKAGE_JSON_TS_ONLY = """\
{
  "name": "qa-rag-ts-validate",
  "version": "1.0.0",
  "private": true,
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0"
  }
}
"""

_PACKAGE_JSON_PLAYWRIGHT = """\
{
  "name": "qa-rag-sandbox",
  "version": "1.0.0",
  "private": true,
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0"
  }
}
"""

_TSCONFIG = """\
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020", "DOM"],
    "strict": false,
    "esModuleInterop": true,
    "allowJs": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["*.ts", "*.tsx"]
}
"""

# Stub types for @playwright/test so tsc doesn't fail on imports without the package
_PLAYWRIGHT_STUB = """\
declare module "@playwright/test" {
  export const test: any;
  export const expect: any;
  export type Page = any;
  export type BrowserContext = any;
  export type Browser = any;
  export type Locator = any;
  export type Request = any;
  export type Response = any;
  export type Download = any;
  export type FileChooser = any;
  export type Route = any;
  export type APIRequestContext = any;
  export type APIResponse = any;
  export type TestInfo = any;
  export type PlaywrightTestOptions = any;
  export function defineConfig(cfg: any): any;
  export function devices(name: string): any;
  export const chromium: any;
  export const firefox: any;
  export const webkit: any;
}
"""

# ── Helpers ───────────────────────────────────────────────────────────────────

def _node_available() -> bool:
    try:
        r = subprocess.run(["node", "--version"], capture_output=True, timeout=5)
        return r.returncode == 0
    except Exception:
        return False


def _npm_available() -> bool:
    try:
        r = subprocess.run(["npm", "--version"], capture_output=True, timeout=5)
        return r.returncode == 0
    except Exception:
        return False


def _write_sandbox(tmpdir: str, files: List[Dict[str, str]], playwright: bool = True) -> None:
    for f in files:
        name = os.path.basename(f.get("filename", "spec.ts"))
        with open(os.path.join(tmpdir, name), "w") as fp:
            fp.write(f.get("content", ""))
    if playwright:
        with open(os.path.join(tmpdir, "playwright.config.ts"), "w") as fp:
            fp.write(_PLAYWRIGHT_CONFIG)
        with open(os.path.join(tmpdir, "package.json"), "w") as fp:
            fp.write(_PACKAGE_JSON_PLAYWRIGHT)
    else:
        # Validation-only: drop a root-level .d.ts so tsc can resolve @playwright/test
        # without requiring the full package download. TypeScript auto-includes *.d.ts files.
        with open(os.path.join(tmpdir, "playwright-stub.d.ts"), "w") as fp:
            fp.write(_PLAYWRIGHT_STUB)
        with open(os.path.join(tmpdir, "package.json"), "w") as fp:
            fp.write(_PACKAGE_JSON_TS_ONLY)
    with open(os.path.join(tmpdir, "tsconfig.json"), "w") as fp:
        fp.write(_TSCONFIG)


def _install_deps(tmpdir: str, timeout: int = 120) -> Optional[str]:
    r = subprocess.run(
        ["npm", "install", "--prefer-offline", "--no-audit", "--no-fund", "--silent"],
        capture_output=True, text=True, timeout=timeout, cwd=tmpdir,
    )
    if r.returncode != 0:
        return r.stderr[:600] or r.stdout[:600]
    return None


def _parse_playwright_json(output_path: str) -> List[Dict]:
    tests = []
    try:
        with open(output_path) as f:
            data = json.load(f)
        for suite in data.get("suites", []):
            _collect(suite, tests, "")
    except Exception:
        pass
    return tests


def _collect(suite: dict, out: list, parent: str) -> None:
    title = suite.get("title", "")
    full = f"{parent} › {title}".strip(" › ") if title else parent
    for spec in suite.get("specs", []):
        for test in spec.get("tests", []):
            status = test.get("status", "unknown")
            dur = sum(res.get("duration", 0) for res in test.get("results", []))
            errors = []
            for res in test.get("results", []):
                for err in res.get("errors", []):
                    msg = err.get("message", "") or err.get("value", "")
                    if msg:
                        errors.append(msg[:300])
            out.append({
                "title": spec.get("title", ""),
                "suite": full,
                "status": status,
                "duration_ms": dur,
                "error": "\n".join(errors)[:400] if errors else "",
            })
    for child in suite.get("suites", []):
        _collect(child, out, full)


# ── Public API ────────────────────────────────────────────────────────────────

def validate_typescript(files: List[Dict[str, str]]) -> Dict[str, Any]:
    """
    Run tsc --noEmit over the spec files.
    Fast (~2 s) — no browser required.
    """
    if not _node_available():
        return {"success": False, "mode": "validate",
                "error": "Node.js not available on server", "tests": [], "passed": 0, "failed": 0, "total": 0}
    tmpdir = tempfile.mkdtemp(prefix="qa_validate_")
    t0 = time.time()
    try:
        _write_sandbox(tmpdir, files, playwright=False)  # TypeScript-only, no Playwright download
        err = _install_deps(tmpdir)
        if err:
            return {"success": False, "mode": "validate", "error": f"npm install failed: {err}",
                    "tests": [], "passed": 0, "failed": 0, "total": 0, "duration_ms": int((time.time()-t0)*1000)}
        r = subprocess.run(
            [os.path.join(tmpdir, "node_modules", ".bin", "tsc"), "--noEmit", "--project", "tsconfig.json"],
            capture_output=True, text=True, timeout=60, cwd=tmpdir,
        )
        errors = r.stdout.strip() + r.stderr.strip()
        ok = r.returncode == 0
        lines = [l for l in errors.splitlines() if l.strip()]
        issues = []
        for line in lines[:30]:
            m = re.match(r"(.+\.ts)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)", line)
            if m:
                issues.append({"file": m.group(1), "line": int(m.group(2)), "code": m.group(4), "message": m.group(5)})
        return {
            "success": ok, "mode": "validate",
            "issues": issues,
            "raw_output": errors[:1500] if not ok else "",
            "tests": [], "passed": 0, "failed": 0, "total": 0,
            "duration_ms": int((time.time()-t0)*1000),
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "mode": "validate", "error": "tsc timed out", "tests": [], "passed": 0, "failed": 0, "total": 0}
    except Exception as exc:
        logger.error("validate_typescript error: %s", exc)
        return {"success": False, "mode": "validate", "error": str(exc), "tests": [], "passed": 0, "failed": 0, "total": 0}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def dry_run_discover(files: List[Dict[str, str]]) -> Dict[str, Any]:
    """
    Run `npx playwright test --list` to enumerate all test() blocks.
    Validates Playwright syntax and fixture usage without launching a browser.
    """
    if not _node_available():
        return {"success": False, "mode": "dry_run",
                "error": "Node.js not available on server", "tests": [], "passed": 0, "failed": 0, "total": 0}
    tmpdir = tempfile.mkdtemp(prefix="qa_dryrun_")
    t0 = time.time()
    try:
        _write_sandbox(tmpdir, files)
        err = _install_deps(tmpdir)
        if err:
            return {"success": False, "mode": "dry_run", "error": f"npm install failed: {err}",
                    "tests": [], "passed": 0, "failed": 0, "total": 0, "duration_ms": int((time.time()-t0)*1000)}
        r = subprocess.run(
            [os.path.join(tmpdir, "node_modules", ".bin", "playwright"), "test", "--list", "--reporter=line"],
            capture_output=True, text=True, timeout=60, cwd=tmpdir,
        )
        combined = r.stdout + r.stderr
        discovered = []
        for line in combined.splitlines():
            m = re.search(r"•\s+(.+)", line) or re.search(r"\[\d+\]\s+(.+)", line)
            if m:
                title = m.group(1).strip()
                if title:
                    discovered.append({"title": title, "suite": "", "status": "discovered",
                                       "duration_ms": 0, "error": ""})
        ok = len(discovered) > 0 or r.returncode == 0
        return {
            "success": ok, "mode": "dry_run",
            "tests": discovered,
            "passed": 0, "failed": 0, "skipped": 0, "total": len(discovered),
            "stdout": combined[:1500],
            "duration_ms": int((time.time()-t0)*1000),
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "mode": "dry_run", "error": "Playwright list timed out",
                "tests": [], "passed": 0, "failed": 0, "total": 0}
    except Exception as exc:
        logger.error("dry_run_discover error: %s", exc)
        return {"success": False, "mode": "dry_run", "error": str(exc), "tests": [], "passed": 0, "failed": 0, "total": 0}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def execute_tests(
    files: List[Dict[str, str]],
    timeout_seconds: int = 120,
    base_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Full Playwright test execution (headless Chromium).
    Requires a live target application at base_url.
    """
    if not _node_available():
        return {"success": False, "mode": "execute",
                "error": "Node.js not available on server", "tests": [], "passed": 0, "failed": 0, "total": 0}
    tmpdir = tempfile.mkdtemp(prefix="qa_exec_")
    t0 = time.time()
    try:
        _write_sandbox(tmpdir, files)

        # Inject baseURL into config if provided
        if base_url:
            cfg = _PLAYWRIGHT_CONFIG.replace(
                "use: { headless: true",
                f"use: {{ headless: true, baseURL: '{base_url}'",
            )
            with open(os.path.join(tmpdir, "playwright.config.ts"), "w") as fp:
                fp.write(cfg)

        err = _install_deps(tmpdir)
        if err:
            return {"success": False, "mode": "execute", "error": f"npm install failed: {err}",
                    "tests": [], "passed": 0, "failed": 0, "total": 0, "duration_ms": int((time.time()-t0)*1000)}

        # Install Chromium only (smaller than all browsers)
        subprocess.run(
            ["npx", "playwright", "install", "chromium"],
            capture_output=True, timeout=300, cwd=tmpdir,
        )

        r = subprocess.run(
            [os.path.join(tmpdir, "node_modules", ".bin", "playwright"), "test",
             "--reporter=json", "--output=results.json",
             f"--timeout={15_000}"],
            capture_output=True, text=True, timeout=timeout_seconds, cwd=tmpdir,
        )

        results_path = os.path.join(tmpdir, "results.json")
        tests = _parse_playwright_json(results_path) if os.path.exists(results_path) else []

        if not tests:
            # Fallback: parse stdout JSON
            try:
                data = json.loads(r.stdout)
                for suite in data.get("suites", []):
                    _collect(suite, tests, "")
            except Exception:
                pass

        passed = sum(1 for t in tests if t["status"] == "passed")
        failed = sum(1 for t in tests if t["status"] in ("failed", "timedOut"))
        skipped = sum(1 for t in tests if t["status"] == "skipped")

        return {
            "success": failed == 0 and len(tests) > 0,
            "mode": "execute",
            "tests": tests,
            "passed": passed, "failed": failed, "skipped": skipped, "total": len(tests),
            "duration_ms": int((time.time()-t0)*1000),
            "stderr": r.stderr[:800] if r.returncode != 0 else "",
        }

    except subprocess.TimeoutExpired:
        return {"success": False, "mode": "execute",
                "error": f"Test execution timed out after {timeout_seconds}s",
                "tests": [], "passed": 0, "failed": 0, "total": 0,
                "duration_ms": int((time.time()-t0)*1000)}
    except Exception as exc:
        logger.error("execute_tests error: %s", exc)
        return {"success": False, "mode": "execute", "error": str(exc),
                "tests": [], "passed": 0, "failed": 0, "total": 0}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
