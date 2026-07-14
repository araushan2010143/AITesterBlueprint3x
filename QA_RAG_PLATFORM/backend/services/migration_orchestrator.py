"""
Orchestrates multi-file migration jobs.
- Runs migration_agent.run() per file (sequentially — LLM is the bottleneck)
- Emits real-time SSE events via per-job asyncio.Queue
- Persists job state to SQLite after each file
"""
import json
import asyncio
import logging
from typing import Any, Callable, Dict, List, Tuple
from datetime import datetime

from sqlmodel import Session
from backend.database.db import engine
from backend.models.migration_job import MigrationJob
from backend.agents.migration_agent import run as migrate_file
from backend.services.report_generator import generate_html_report

logger = logging.getLogger(__name__)

# job_id → asyncio.Queue of SSE event dicts
_queues: Dict[str, asyncio.Queue] = {}


# ── Queue helpers ──────────────────────────────────────────────────────────────

def get_or_create_queue(job_id: str) -> asyncio.Queue:
    if job_id not in _queues:
        _queues[job_id] = asyncio.Queue()
    return _queues[job_id]


def drop_queue(job_id: str) -> None:
    _queues.pop(job_id, None)


# ── SSE async generator ────────────────────────────────────────────────────────

async def stream_job(job_id: str):
    """Yield SSE-formatted strings for a running job."""
    q = get_or_create_queue(job_id)
    while True:
        try:
            event = await asyncio.wait_for(q.get(), timeout=25)
        except asyncio.TimeoutError:
            yield 'data: {"type":"ping"}\n\n'
            continue
        yield f"data: {json.dumps(event)}\n\n"
        if event.get("type") in ("job_done", "job_failed"):
            drop_queue(job_id)
            break


# ── Emit helper (thread → event loop) ─────────────────────────────────────────

def _emit(job_id: str, event: dict) -> None:
    try:
        loop = asyncio.get_event_loop()
        q = get_or_create_queue(job_id)
        loop.call_soon_threadsafe(q.put_nowait, event)
    except Exception as exc:
        logger.debug("SSE emit skipped (%s): %s", job_id[:8], exc)


# ── DB helpers ─────────────────────────────────────────────────────────────────

def _save(job_id: str, **kwargs) -> None:
    with Session(engine) as s:
        job = s.get(MigrationJob, job_id)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)
            job.updated_at = datetime.utcnow()
            s.add(job)
            s.commit()


# ── Main job runner ────────────────────────────────────────────────────────────

def run_migration_job(job_id: str, files: List[Tuple[str, str]]) -> None:
    """
    Synchronous — called via FastAPI BackgroundTasks (thread pool).
    Processes each file through the 5-stage pipeline, emitting SSE events.
    """
    logger.info("Job %s starting — %d file(s)", job_id[:8], len(files))
    _save(job_id, status="running", file_count=len(files))
    _emit(job_id, {"type": "job_start", "total": len(files)})

    per_file_results: List[Dict[str, Any]] = []
    completed = 0
    failed = 0

    for idx, (filename, content) in enumerate(files):
        _emit(job_id, {"type": "file_start", "file": filename, "index": idx})

        def on_stage(stage: int, name: str, fn: str = filename) -> None:
            _emit(job_id, {"type": "stage", "file": fn, "stage": stage, "stage_name": name})

        try:
            result = migrate_file(content, on_stage=on_stage)
            result["filename"] = filename
            per_file_results.append({"file": filename, "status": "done", "result": result})
            completed += 1
            _emit(job_id, {
                "type": "file_done",
                "file": filename,
                "confidence": result.get("confidence_score", 0),
                "language": result.get("source_analysis", {}).get("language", "?"),
                "framework": result.get("source_analysis", {}).get("framework", "?"),
            })
        except Exception as exc:
            failed += 1
            logger.error("Migration failed for %s: %s", filename, exc)
            per_file_results.append({"file": filename, "status": "failed", "error": str(exc)})
            _emit(job_id, {"type": "file_failed", "file": filename, "error": str(exc)[:200]})

        _save(job_id, completed_files=completed, failed_files=failed)

    try:
        report_html = generate_html_report(job_id, per_file_results)
    except Exception as exc:
        logger.warning("Report generation failed: %s", exc)
        report_html = ""

    final_status = "done" if failed == 0 else ("failed" if completed == 0 else "partial")
    _save(
        job_id,
        status=final_status,
        completed_files=completed,
        failed_files=failed,
        results_json=json.dumps(per_file_results),
        report_html=report_html,
    )
    _emit(job_id, {
        "type": "job_done",
        "total": len(files),
        "succeeded": completed,
        "failed": failed,
        "status": final_status,
    })
    logger.info("Job %s complete — %d ok, %d failed", job_id[:8], completed, failed)
