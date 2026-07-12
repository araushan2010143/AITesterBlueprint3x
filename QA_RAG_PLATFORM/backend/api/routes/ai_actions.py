import time
from fastapi import APIRouter, HTTPException
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
        ]
    }


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
    total_ms = round((time.perf_counter() - t0) * 1000, 1)

    return AIActionResponse(
        action=action,
        result=result,
        tokens_used=result.pop("tokens_used", 0),
        latency_ms=result.pop("latency_ms", total_ms),
    )
