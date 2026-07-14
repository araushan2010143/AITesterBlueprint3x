"""V2 Migration API — multi-file pipeline with SSE progress streaming."""
import io
import json
import uuid
import zipfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlmodel import Session, select

from backend.database.db import engine
from backend.models.migration_job import MigrationJob
from backend.services.file_extractor import extract_from_github, extract_from_zip
from backend.services.migration_orchestrator import (
    get_or_create_queue,
    run_migration_job,
    stream_job,
)

router = APIRouter(prefix="/api/migration", tags=["Migration V2"])


# ── Create job ─────────────────────────────────────────────────────────────────

@router.post("/jobs")
async def create_job(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(None),
    github_url: Optional[str] = Form(None),
):
    if not file and not github_url:
        raise HTTPException(400, "Provide a ZIP file or a GitHub URL")

    if file:
        data = await file.read()
        try:
            files = extract_from_zip(data)
        except Exception as exc:
            raise HTTPException(400, f"Could not read ZIP: {exc}")
        source_type = "zip"
        source_name = file.filename or "upload.zip"
    else:
        try:
            files = extract_from_github(github_url.strip())
        except Exception as exc:
            raise HTTPException(400, f"Could not fetch GitHub repo: {exc}")
        source_type = "github"
        source_name = github_url.strip()

    if not files:
        raise HTTPException(
            400,
            "No test files found. "
            "ZIP should contain .java/.py/.cs/.ts/.robot/.feature files with @Test / def test_ etc.",
        )

    job_id = str(uuid.uuid4())
    get_or_create_queue(job_id)   # create queue before background task starts

    with Session(engine) as s:
        job = MigrationJob(
            id=job_id,
            source_type=source_type,
            source_name=source_name,
            file_count=len(files),
        )
        s.add(job)
        s.commit()

    background_tasks.add_task(run_migration_job, job_id, files)
    return {"job_id": job_id, "file_count": len(files), "source_name": source_name}


# ── SSE stream ─────────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/stream")
async def stream_progress(job_id: str):
    with Session(engine) as s:
        if not s.get(MigrationJob, job_id):
            raise HTTPException(404, "Job not found")
    return StreamingResponse(
        stream_job(job_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── List jobs ──────────────────────────────────────────────────────────────────

@router.get("/jobs")
def list_jobs():
    with Session(engine) as s:
        jobs = s.exec(
            select(MigrationJob).order_by(MigrationJob.created_at.desc()).limit(25)
        ).all()
    return {
        "jobs": [
            {
                "id": j.id,
                "status": j.status,
                "source_type": j.source_type,
                "source_name": j.source_name,
                "file_count": j.file_count,
                "completed_files": j.completed_files,
                "failed_files": j.failed_files,
                "created_at": j.created_at.isoformat(),
            }
            for j in jobs
        ]
    }


# ── Get single job ─────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    with Session(engine) as s:
        job = s.get(MigrationJob, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    results = json.loads(job.results_json) if job.results_json else []
    return {
        "id": job.id,
        "status": job.status,
        "source_type": job.source_type,
        "source_name": job.source_name,
        "file_count": job.file_count,
        "completed_files": job.completed_files,
        "failed_files": job.failed_files,
        "created_at": job.created_at.isoformat(),
        "results": results,
    }


# ── HTML report ────────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/report")
def get_report(job_id: str):
    with Session(engine) as s:
        job = s.get(MigrationJob, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if not job.report_html:
        raise HTTPException(404, "Report not ready yet")
    return HTMLResponse(content=job.report_html)


# ── ZIP download ───────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/download")
def download_zip(job_id: str):
    with Session(engine) as s:
        job = s.get(MigrationJob, job_id)
    if not job or not job.results_json:
        raise HTTPException(404, "Job not found or results not ready")

    results = json.loads(job.results_json)
    buf = io.BytesIO()

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fr in results:
            if fr["status"] != "done":
                continue
            res = fr["result"]
            stem = Path(fr["file"]).stem

            if res.get("spec_ts"):
                zf.writestr(f"{stem}/spec.ts", res["spec_ts"])

            pom = res.get("page_objects") or {}
            if pom.get("base_page"):
                zf.writestr(f"{stem}/pages/BasePage.ts", pom["base_page"])
            for po in pom.get("page_objects", []):
                zf.writestr(f"{stem}/pages/{po['filename']}", po["content"])

        if job.report_html:
            zf.writestr("migration_report.html", job.report_html)

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="migration_{job_id[:8]}.zip"'
        },
    )


# ── Delete job ─────────────────────────────────────────────────────────────────

@router.delete("/jobs/{job_id}")
def delete_job(job_id: str):
    with Session(engine) as s:
        job = s.get(MigrationJob, job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        s.delete(job)
        s.commit()
    return {"ok": True}
