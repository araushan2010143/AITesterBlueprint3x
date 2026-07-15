"""V2/V3 Migration API — multi-file pipeline, SSE progress, standards RAG, PR generation."""
import io
import json
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlmodel import Session, select

from backend.database.db import engine
from backend.models.migration_job import MigrationJob
from backend.models.migration_standards import MigrationStandard
from backend.services.file_extractor import (
    extract_from_zip, extract_from_url, detect_source_type,
)
from backend.services import standards_service, github_service
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
    repo_url: Optional[str] = Form(None),
    repo_token: Optional[str] = Form(None),   # PAT / private token / "user:app_password"
    # Legacy field — kept for backwards compat
    github_url: Optional[str] = Form(None),
):
    url = repo_url or github_url
    if not file and not url:
        raise HTTPException(400, "Provide a ZIP file or a repository URL")

    if file:
        data = await file.read()
        try:
            files = extract_from_zip(data)
        except Exception as exc:
            raise HTTPException(400, f"Could not read ZIP: {exc}")
        source_type = "zip"
        source_name = file.filename or "upload.zip"
    else:
        url = url.strip()
        source_type = detect_source_type(url)
        source_name = url
        try:
            files = extract_from_url(url, token=repo_token or "")
        except Exception as exc:
            raise HTTPException(400, f"Could not fetch repository: {exc}")

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


# ── Version history ────────────────────────────────────────────────────────────

@router.post("/jobs/{job_id}/versions")
def save_version(job_id: str):
    """Snapshot current results as a new version (for rollback)."""
    with Session(engine) as s:
        job = s.get(MigrationJob, job_id)
        if not job or not job.results_json:
            raise HTTPException(404, "Job not found or no results yet")
        versions = json.loads(job.versions_json) if job.versions_json else []
        versions.append({
            "version": len(versions) + 1,
            "created_at": datetime.utcnow().isoformat(),
            "results_json": job.results_json,
        })
        job.versions_json = json.dumps(versions[-10:])  # keep last 10
        job.updated_at = datetime.utcnow()
        s.add(job)
        s.commit()
    return {"ok": True, "version": len(versions)}


@router.get("/jobs/{job_id}/versions")
def list_versions(job_id: str):
    with Session(engine) as s:
        job = s.get(MigrationJob, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    versions = json.loads(job.versions_json) if job.versions_json else []
    return {"versions": [{"version": v["version"], "created_at": v["created_at"]} for v in versions]}


@router.post("/jobs/{job_id}/versions/{version}/restore")
def restore_version(job_id: str, version: int):
    """Restore a previous version as the current results."""
    with Session(engine) as s:
        job = s.get(MigrationJob, job_id)
        if not job or not job.versions_json:
            raise HTTPException(404, "Job or versions not found")
        versions = json.loads(job.versions_json)
        match = next((v for v in versions if v["version"] == version), None)
        if not match:
            raise HTTPException(404, f"Version {version} not found")
        job.results_json = match["results_json"]
        job.updated_at = datetime.utcnow()
        s.add(job)
        s.commit()
    return {"ok": True, "restored_version": version}


# ── Company standards ──────────────────────────────────────────────────────────

@router.get("/standards")
def list_stds():
    return {"standards": standards_service.list_standards()}


@router.post("/standards")
async def upload_standard(
    file: UploadFile = File(...),
    name: str = Form(""),
):
    content = (await file.read()).decode("utf-8", errors="replace")
    std_name = name or file.filename or "Standard"
    std = standards_service.save_standard(std_name, file.filename or "", content)
    return {"id": std.id, "name": std.name, "ok": True}


@router.delete("/standards/{std_id}")
def delete_std(std_id: str):
    ok = standards_service.delete_standard(std_id)
    if not ok:
        raise HTTPException(404, "Standard not found")
    return {"ok": True}


# ── GitHub PR auto-generation ──────────────────────────────────────────────────

@router.post("/jobs/{job_id}/create-pr")
def create_pr(
    job_id: str,
    github_token: str = Form(...),
    repo: str = Form(...),           # "owner/repo" or full GitHub URL
    branch_prefix: str = Form("migration"),
    base_branch: str = Form("main"),
):
    with Session(engine) as s:
        job = s.get(MigrationJob, job_id)
    if not job or not job.results_json:
        raise HTTPException(404, "Job not found or results not ready")

    results = json.loads(job.results_json)
    branch_name = f"{branch_prefix}/{job_id[:8]}"

    files = github_service.build_pr_files(results)
    if not files:
        raise HTTPException(400, "No successfully migrated files to push")

    pr_title = f"chore(migration): migrate {job.source_name} to Playwright TypeScript"
    pr_body = github_service.build_pr_body(job_id, results)

    try:
        result = github_service.create_pr(
            token=github_token,
            repo=repo,
            files=files,
            branch_name=branch_name,
            pr_title=pr_title,
            pr_body=pr_body,
            base_branch=base_branch,
        )
    except Exception as exc:
        raise HTTPException(400, str(exc))

    return result
