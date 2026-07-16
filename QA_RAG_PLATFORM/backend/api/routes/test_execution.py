"""
Test execution API — run migrated Playwright specs in a server-side sandbox.

Endpoints:
  POST /api/test-execution/validate          TypeScript compile check (fast)
  POST /api/test-execution/dry-run           Playwright --list test discovery
  POST /api/test-execution/execute           Full Playwright run (needs live target)
  POST /api/test-execution/jobs/{job_id}     Run tests from an existing migration job
"""
import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.services.test_executor import (
    validate_typescript,
    dry_run_discover,
    execute_tests,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/test-execution", tags=["test-execution"])


class FilePayload(BaseModel):
    filename: str = Field(default="spec.ts")
    content: str


class ValidateRequest(BaseModel):
    files: List[FilePayload]


class ExecuteRequest(BaseModel):
    files: List[FilePayload]
    base_url: Optional[str] = Field(default=None, description="Target app URL for full execution")
    timeout_seconds: int = Field(default=90, ge=10, le=300)


# ── Validate (TypeScript compilation) ────────────────────────────────────────

@router.post("/validate")
async def validate(req: ValidateRequest):
    """
    Run tsc --noEmit over uploaded spec files.
    Returns TypeScript errors with file/line/message detail.
    Typically completes in under 10 seconds.
    """
    files = [{"filename": f.filename, "content": f.content} for f in req.files]
    result = validate_typescript(files)
    return result


# ── Dry-run discovery ─────────────────────────────────────────────────────────

@router.post("/dry-run")
async def dry_run(req: ValidateRequest):
    """
    Run `npx playwright test --list` to discover all test() blocks.
    Validates Playwright imports and test structure without launching a browser.
    """
    files = [{"filename": f.filename, "content": f.content} for f in req.files]
    result = dry_run_discover(files)
    return result


# ── Full execution ─────────────────────────────────────────────────────────────

@router.post("/execute")
async def execute(req: ExecuteRequest):
    """
    Run tests with headless Chromium. Requires a live target application.
    Pass base_url to inject it into playwright.config baseURL.
    """
    files = [{"filename": f.filename, "content": f.content} for f in req.files]
    result = execute_tests(files, timeout_seconds=req.timeout_seconds, base_url=req.base_url)
    return result


# ── Execute from migration job ────────────────────────────────────────────────

@router.post("/jobs/{job_id}")
async def execute_job(job_id: str, base_url: Optional[str] = None, mode: str = "dry_run"):
    """
    Load spec_ts files from a completed migration job and run them.
    mode: validate | dry_run | execute
    """
    from sqlmodel import Session
    from backend.database.db import engine
    from backend.models.migration_job import MigrationJob

    with Session(engine) as s:
        job = s.get(MigrationJob, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.status not in ("done", "partial"):
            raise HTTPException(status_code=400, detail=f"Job is not complete (status: {job.status})")
        if not job.results_json:
            raise HTTPException(status_code=400, detail="Job has no results")

    try:
        results = json.loads(job.results_json)
    except Exception:
        raise HTTPException(status_code=500, detail="Could not parse job results")

    files = []
    for entry in results:
        if entry.get("status") == "done":
            spec = entry.get("result", {}).get("spec_ts", "")
            fname = entry.get("file", "spec.ts")
            if spec:
                # Ensure filename ends in .spec.ts
                if not fname.endswith((".spec.ts", ".test.ts")):
                    fname = fname.rsplit(".", 1)[0] + ".spec.ts"
                files.append({"filename": fname, "content": spec})

    if not files:
        raise HTTPException(status_code=400, detail="No migrated spec files found in job")

    if mode == "validate":
        return validate_typescript(files)
    elif mode == "execute":
        return execute_tests(files, base_url=base_url)
    else:
        return dry_run_discover(files)
