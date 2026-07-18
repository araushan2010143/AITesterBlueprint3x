"""APScheduler wired into FastAPI lifespan — runs auto-ingest every hour."""
from __future__ import annotations
import logging
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

log = logging.getLogger("scheduler")
_scheduler: AsyncIOScheduler | None = None


async def _run_auto_ingest() -> None:
    from services.auto_ingester import run_once, _state
    if _state["running"]:
        log.info("Auto-ingest already running — skipping this tick")
        return

    _state["running"] = True
    _state["last_run"] = datetime.now(timezone.utc).isoformat()
    log.info("⏰ Auto-ingest started")

    try:
        import asyncio
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, run_once)
        _state["last_result"] = result
        _state["total_runs"]  += 1
        log.info(
            "✅ Auto-ingest done — %d new, %d modified, %d unchanged, +%d chunks",
            result["files_new"], result["files_modified"],
            result["files_unchanged"], result["chunks_indexed"],
        )
    except Exception as exc:
        log.error("Auto-ingest failed: %s", exc)
    finally:
        _state["running"] = False
        _state["next_run"] = (
            datetime.now(timezone.utc) + timedelta(hours=1)
        ).isoformat()


def start_scheduler(interval_hours: int = 1) -> AsyncIOScheduler:
    global _scheduler
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(
        _run_auto_ingest,
        trigger=IntervalTrigger(hours=interval_hours),
        id="auto_ingest",
        name="Hourly data folder ingest",
        replace_existing=True,
        next_run_time=datetime.now(timezone.utc) + timedelta(hours=interval_hours),
    )
    _scheduler.start()

    from services.auto_ingester import _state
    _state["next_run"] = (
        datetime.now(timezone.utc) + timedelta(hours=interval_hours)
    ).isoformat()

    log.info("⏰ Scheduler started — auto-ingest every %dh", interval_hours)
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        _scheduler = None
