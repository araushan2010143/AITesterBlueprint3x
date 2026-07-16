"""
Celery tasks for connector sync operations.

These replace the FastAPI BackgroundTasks approach, providing:
  - Retry on transient failures (network timeouts, rate limits)
  - Worker-pool isolation (doesn't block API processes)
  - Task result + state visibility
  - Dead-letter handling for failed syncs
"""
from __future__ import annotations

import base64
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def _task(fn):
    """Conditionally register fn as a Celery task."""
    from backend.celery_app import celery_app
    if celery_app:
        return celery_app.task(
            bind=True,
            max_retries=3,
            default_retry_delay=120,  # 2 min between retries
            name=f"backend.tasks.connector_tasks.{fn.__name__}",
        )(fn)
    return fn


@_task
def sync_connector_task(self, run_id, connector_id):
    """Full connector sync: fetch documents and ingest into RAG + Knowledge Graph."""
    from backend.api.routes.connectors import _run_sync
    _run_sync(run_id, connector_id)
    logger.info("Celery connector sync complete: %s", connector_id)


@_task
def populate_graph_task(self, connector_id):
    """Populate the Knowledge Graph from a Jira connector (post-sync enrichment)."""
    actual_id = connector_id
    from backend.api.routes.graph import _bg_populate_jira
    from sqlmodel import Session
    from backend.database.db import engine
    from backend.models.connector import DataConnector
    with Session(engine) as db:
        conn = db.get(DataConnector, actual_id)
        team_id = conn.team_id if conn else None
    _bg_populate_jira(actual_id, team_id)
    logger.info("Celery graph population complete: %s", actual_id)
