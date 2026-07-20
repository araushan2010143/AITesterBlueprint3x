import time
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from backend.models.schemas import AIActionRequest, AIActionResponse
from backend.agents.router import dispatch, SUPPORTED_ACTIONS

router = APIRouter(prefix="/api/ai", tags=["AI Actions"])


@router.get("/actions")
def list_actions():
    return {
        "actions": [
            {"id": "generate_test_cases", "label": "Generate Test Cases", "description": "Generate functional, negative, boundary, accessibility, performance, and security test cases from requirements.", "icon": "TestTube"},
            {"id": "find_duplicates", "label": "Find Duplicate Test Cases", "description": "Detect duplicate or near-duplicate test cases and suggest merge actions.", "icon": "Copy"},
            {"id": "coverage_analysis", "label": "Requirement Coverage Analysis", "description": "Map requirements to test cases and identify testing gaps.", "icon": "Target"},
            {"id": "rca", "label": "Root Cause Analysis", "description": "Analyze test execution reports to identify root causes of failures.", "icon": "Search"},
            {"id": "release_summary", "label": "Release Summary", "description": "Generate a professional release readiness summary from execution reports.", "icon": "FileCheck"},
            {"id": "explain_failure", "label": "Explain Failure", "description": "Analyze Playwright trace or failure logs and explain the root cause with fix suggestions.", "icon": "AlertCircle"},
            {"id": "automate", "label": "Automation Recommendations", "description": "Identify which manual test cases should be automated with ROI estimates.", "icon": "Zap"},
            {"id": "generate_script", "label": "Generate Automation Script", "description": "Generate Playwright, Selenium, Cypress, or API test scripts.", "icon": "Code"},
            {"id": "test_data", "label": "Test Data Generator", "description": "Generate valid, invalid, boundary, SQL injection, and XSS test data.", "icon": "Database"},
            {"id": "flaky_analyzer", "label": "Flaky Test Analyzer", "description": "Detect non-deterministic tests from multi-run results, diagnose root causes, and get code-level fixes to make tests prod-ready.", "icon": "Flame"},
            {"id": "automation_pipeline", "label": "Automation Pipeline", "description": "Convert manual test cases into production-ready Playwright + Cucumber BDD + TypeScript POM — Feature file, Step Definitions, Page Object, and Locators.", "icon": "GitBranch"},
            {"id": "migration_engine", "label": "Legacy Migration Engine", "description": "Migrate Java Selenium, C# NUnit/MSTest, Python Selenium, Robot Framework, Cucumber, TestNG/JUnit to production-ready Playwright TypeScript with full POM architecture.", "icon": "RefreshCw"},
        ]
    }


@router.post("/parse-report")
async def parse_report(
    file: UploadFile = File(...),
    build_label: str = Form("Build-1"),
):
    """
    Accept a test report file (JUnit XML, Playwright JSON, plain text)
    and return normalised text ready for the Flaky Test Analyzer.
    """
    try:
        raw = await file.read()
        content = raw.decode("utf-8", errors="replace")
        from backend.parsers.test_report_normalizer import normalize
        normalised = normalize(content, filename=file.filename or "", build_label=build_label)
        return {
            "filename":   file.filename,
            "format":     _detect_format(content),
            "text":       normalised,
            "char_count": len(normalised),
        }
    except Exception as e:
        import traceback, logging
        logging.getLogger(__name__).error("parse-report error: %s", traceback.format_exc())
        raise HTTPException(status_code=400, detail=f"Could not parse report: {e}")


def _detect_format(content: str) -> str:
    stripped = content.lstrip()
    if stripped.startswith("<"):
        return "JUnit XML"
    try:
        import json
        data = json.loads(content)
        if "suites" in data and "stats" in data:
            return "Playwright JSON"
        return "JSON"
    except Exception:
        return "Plain Text"


@router.post("/{action}", response_model=AIActionResponse)
def run_action(action: str, req: AIActionRequest):
    if action not in SUPPORTED_ACTIONS:
        raise HTTPException(400, f"Unknown action '{action}'. Supported: {SUPPORTED_ACTIONS}")

    if not req.content:
        raise HTTPException(400, "content is required")

    t0 = time.perf_counter()
    try:
        result = dispatch(action=action, content=req.content, options=req.options or {})
    except RuntimeError as e:
        msg = str(e)
        status = 429 if "daily token limit" in msg or "rate limit" in msg.lower() else 503
        raise HTTPException(status_code=status, detail=msg)
    except Exception as e:
        import traceback, logging
        logging.getLogger(__name__).error("Unhandled pipeline error: %s", traceback.format_exc())
        # Include cause chain so callers see the real httpx/network error, not just the wrapper
        cause = getattr(e, "__cause__", None) or getattr(e, "__context__", None)
        cause_info = (
            f" ← {type(cause).__name__}: {str(cause)[:200]}" if cause else ""
        )
        raise HTTPException(
            status_code=500,
            detail=f"Pipeline error: {type(e).__name__}: {str(e)[:300]}{cause_info}",
        )
    total_ms = round((time.perf_counter() - t0) * 1000, 1)

    return AIActionResponse(
        action=action,
        result=result,
        tokens_used=result.pop("tokens_used", 0),
        latency_ms=result.pop("latency_ms", total_ms),
    )
