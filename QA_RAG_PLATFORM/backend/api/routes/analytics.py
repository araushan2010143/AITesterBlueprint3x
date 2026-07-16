"""Migration analytics aggregation endpoints."""
from __future__ import annotations
import json
from datetime import datetime, timedelta
from fastapi import APIRouter
from sqlmodel import Session, select
from backend.database.db import engine
from backend.models.migration_job import MigrationJob

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/summary")
def get_summary():
    """Overall migration statistics across all jobs."""
    with Session(engine) as s:
        jobs = s.exec(select(MigrationJob)).all()

    total_jobs = len(jobs)
    total_files = sum(j.file_count or 0 for j in jobs)
    completed = sum(j.completed_files or 0 for j in jobs)
    failed = sum(j.failed_files or 0 for j in jobs)
    success_rate = round(completed / max(total_files, 1) * 100, 1)

    status_counts = {"done": 0, "partial": 0, "failed": 0, "running": 0, "pending": 0}
    for j in jobs:
        key = j.status if j.status in status_counts else "pending"
        status_counts[key] += 1

    fw_counts: dict = {}
    lang_counts: dict = {}
    scores: list = []

    for job in jobs:
        if not job.results_json:
            continue
        for r in json.loads(job.results_json):
            if r.get("status") != "done":
                continue
            res = r.get("result", {})
            sa = res.get("source_analysis", {})
            fw = sa.get("framework") or "Unknown"
            lang = sa.get("language") or "Unknown"
            fw_counts[fw] = fw_counts.get(fw, 0) + 1
            lang_counts[lang] = lang_counts.get(lang, 0) + 1
            cs = res.get("confidence_score")
            if isinstance(cs, (int, float)) and cs > 0:
                scores.append(cs)

    avg_confidence = round(sum(scores) / len(scores), 1) if scores else 0

    src_counts: dict = {}
    for j in jobs:
        k = j.source_type or "unknown"
        src_counts[k] = src_counts.get(k, 0) + 1

    thirty_ago = datetime.utcnow() - timedelta(days=30)
    timeline: dict = {}
    for j in jobs:
        if j.created_at and j.created_at >= thirty_ago:
            day = j.created_at.strftime("%Y-%m-%d")
            timeline[day] = timeline.get(day, 0) + 1

    hours_saved = round(completed * 2.0, 1)

    return {
        "total_jobs": total_jobs,
        "total_files": total_files,
        "completed_files": completed,
        "failed_files": failed,
        "success_rate": success_rate,
        "avg_confidence": avg_confidence,
        "hours_saved": hours_saved,
        "job_status": status_counts,
        "framework_distribution": dict(
            sorted(fw_counts.items(), key=lambda x: -x[1])[:10]
        ),
        "language_distribution": dict(
            sorted(lang_counts.items(), key=lambda x: -x[1])
        ),
        "source_distribution": src_counts,
        "timeline": dict(sorted(timeline.items())),
    }


@router.get("/confidence-trends")
def confidence_trends():
    """Average confidence score by framework (last 200 completed files)."""
    with Session(engine) as s:
        jobs = s.exec(
            select(MigrationJob)
            .where(MigrationJob.status.in_(["done", "partial"]))
            .limit(100)
        ).all()

    fw_scores: dict = {}
    for job in jobs:
        if not job.results_json:
            continue
        for r in json.loads(job.results_json):
            if r.get("status") != "done":
                continue
            res = r.get("result", {})
            fw = res.get("source_analysis", {}).get("framework") or "Unknown"
            cs = res.get("confidence_score")
            if isinstance(cs, (int, float)) and cs > 0:
                fw_scores.setdefault(fw, []).append(cs)

    return {
        "by_framework": {
            fw: round(sum(sc) / len(sc), 1)
            for fw, sc in sorted(fw_scores.items(), key=lambda x: -sum(x[1]))
        }
    }


@router.get("/recent-jobs")
def recent_jobs(limit: int = 10):
    """Latest N migration jobs with summary stats."""
    with Session(engine) as s:
        jobs = s.exec(
            select(MigrationJob)
            .order_by(MigrationJob.created_at.desc())
            .limit(limit)
        ).all()

    out = []
    for j in jobs:
        results = json.loads(j.results_json) if j.results_json else []
        scores = [
            r["result"].get("confidence_score", 0)
            for r in results
            if r.get("status") == "done" and r.get("result")
        ]
        out.append({
            "id": j.id,
            "status": j.status,
            "source_type": j.source_type,
            "source_name": j.source_name,
            "file_count": j.file_count,
            "completed_files": j.completed_files,
            "failed_files": j.failed_files,
            "avg_confidence": round(sum(scores) / len(scores), 1) if scores else 0,
            "created_at": j.created_at.isoformat() if j.created_at else None,
        })

    return {"jobs": out}
