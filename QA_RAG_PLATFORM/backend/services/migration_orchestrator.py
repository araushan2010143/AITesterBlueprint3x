"""
Orchestrates multi-file migration jobs.
- Runs migration_agent.run() per file in parallel (ThreadPoolExecutor, 3 workers)
- Emits real-time SSE events via per-job asyncio.Queue (thread-safe)
- Persists job state to SQLite after each file (serialized with a write lock)
- Stores source content of failed files in results_json to enable retry
"""
import json
import asyncio
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Tuple
from datetime import datetime

from sqlmodel import Session
from backend.database.db import engine
from backend.models.migration_job import MigrationJob
from backend.agents.migration_agent import run as migrate_file
from backend.services.report_generator import generate_html_report
from backend.services.notification_service import notify_job_done

logger = logging.getLogger(__name__)


def _calibrate_confidence(result: dict) -> int:
    """Algorithmic confidence override — prevents LLM hallucinating 95% on bad output."""
    base = result.get("confidence_score", 50)
    if not isinstance(base, (int, float)):
        base = 50
    spec = result.get("spec_ts", "") or ""

    bonuses = 0
    if "import { test, expect }" in spec:          bonuses += 5
    if "export class" in spec:                      bonuses += 5
    if result.get("validation_status") == "pass":  bonuses += 20
    if spec.count("await page.") > 3:             bonuses += 5
    if "BasePage" in spec:                         bonuses += 3
    if (spec.count("locator(") + spec.count("getBy")) > 2: bonuses += 3

    penalties = 0
    todo_hits = spec.count("TODO") + spec.count("FIXME") + spec.count("PLACEHOLDER")
    penalties += todo_hits * 8
    if "waitForTimeout(" in spec:                  penalties += 15
    if "document.querySelector" in spec:           penalties += 10
    if spec.count(": any") > 3:                   penalties += 8
    if "throw new Error" in spec and "not implemented" in spec.lower(): penalties += 20
    if not spec.strip():                           penalties += 50

    return max(5, min(99, int(base + bonuses - penalties)))


# job_id → asyncio.Queue
_queues: Dict[str, asyncio.Queue] = {}

# Serialize SQLite writes from multiple threads
_db_write_lock = threading.Lock()

# How many files to migrate in parallel (LLM is the bottleneck — keep modest)
_PARALLEL_WORKERS = 3


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
    with _db_write_lock:
        with Session(engine) as s:
            job = s.get(MigrationJob, job_id)
            if job:
                for k, v in kwargs.items():
                    setattr(job, k, v)
                job.updated_at = datetime.utcnow()
                s.add(job)
                s.commit()


# ── Per-file processor ─────────────────────────────────────────────────────────

def _process_file(
    job_id: str,
    idx: int,
    filename: str,
    content: str,
    counters: Dict[str, int],
    counters_lock: threading.Lock,
    results: List[Dict[str, Any]],
    results_lock: threading.Lock,
) -> None:
    _emit(job_id, {"type": "file_start", "file": filename, "index": idx})

    def on_stage(stage: int, name: str) -> None:
        _emit(job_id, {"type": "stage", "file": filename, "stage": stage, "stage_name": name})

    try:
        result = migrate_file(content, on_stage=on_stage)
        result["filename"] = filename
        result["confidence_score"] = _calibrate_confidence(result)
        # Store source preview for the diff viewer (first 8 KB only)
        result["source_preview"] = content[:8_000]
        entry: Dict[str, Any] = {"file": filename, "status": "done", "result": result}
        with counters_lock:
            counters["completed"] += 1
            c, f = counters["completed"], counters["failed"]
        _emit(job_id, {
            "type": "file_done",
            "file": filename,
            "confidence": result.get("confidence_score", 0),
            "language": result.get("source_analysis", {}).get("language", "?"),
            "framework": result.get("source_analysis", {}).get("framework", "?"),
        })
    except Exception as exc:
        # Store source content so the retry endpoint can re-run just this file
        entry = {
            "file": filename,
            "status": "failed",
            "error": str(exc),
            "source": content[:60_000],
        }
        with counters_lock:
            counters["failed"] += 1
            c, f = counters["completed"], counters["failed"]
        logger.error("Migration failed for %s: %s", filename, exc)
        _emit(job_id, {"type": "file_failed", "file": filename, "error": str(exc)[:200]})

    with results_lock:
        results.append(entry)
    _save(job_id, completed_files=c, failed_files=f)


# ── Main job runner ────────────────────────────────────────────────────────────

def run_migration_job(job_id: str, files: List[Tuple[str, str]]) -> None:
    """
    Called via FastAPI BackgroundTasks (thread pool).
    Processes files in parallel (up to _PARALLEL_WORKERS at once).
    """
    logger.info("Job %s starting — %d file(s) | %d workers", job_id[:8], len(files), _PARALLEL_WORKERS)
    _save(job_id, status="running", file_count=len(files))
    _emit(job_id, {"type": "job_start", "total": len(files)})

    per_file_results: List[Dict[str, Any]] = []
    results_lock = threading.Lock()
    counters: Dict[str, int] = {"completed": 0, "failed": 0}
    counters_lock = threading.Lock()

    filename_order = {fname: i for i, (fname, _) in enumerate(files)}

    with ThreadPoolExecutor(max_workers=_PARALLEL_WORKERS) as executor:
        futures = [
            executor.submit(
                _process_file,
                job_id, idx, fname, content,
                counters, counters_lock,
                per_file_results, results_lock,
            )
            for idx, (fname, content) in enumerate(files)
        ]
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as exc:
                logger.error("Unexpected worker error in job %s: %s", job_id[:8], exc)

    # Restore original file order in results
    per_file_results.sort(key=lambda r: filename_order.get(r["file"], 999))

    completed = counters["completed"]
    failed = counters["failed"]

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

    # Fire webhook / email notifications (best-effort — never blocks or raises)
    try:
        with Session(engine) as s:
            job = s.get(MigrationJob, job_id)
            if job and (job.webhook_url or job.notify_email):
                notify_job_done(
                    job_id=job_id,
                    source_name=job.source_name,
                    status=final_status,
                    completed=completed,
                    failed=failed,
                    total=len(files),
                    webhook_url=job.webhook_url,
                    notify_email=job.notify_email,
                )
    except Exception as exc:
        logger.warning("Notification dispatch failed for job %s: %s", job_id[:8], exc)
