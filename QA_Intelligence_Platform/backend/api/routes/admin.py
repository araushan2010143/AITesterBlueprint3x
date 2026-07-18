"""Admin endpoints — auto-ingest status + manual trigger."""
from fastapi import APIRouter, BackgroundTasks

router = APIRouter()


@router.get("/ingest/status")
def ingest_status():
    from services.auto_ingester import get_state
    return get_state()


@router.post("/ingest/trigger")
async def trigger_ingest(background_tasks: BackgroundTasks):
    """Manually trigger an immediate ingest run."""
    from services.scheduler import _run_auto_ingest
    background_tasks.add_task(_run_auto_ingest)
    return {"message": "Auto-ingest triggered"}
