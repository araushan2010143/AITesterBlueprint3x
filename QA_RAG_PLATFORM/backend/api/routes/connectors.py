"""
Data Connector CRUD + sync endpoints.

Endpoints:
  GET    /api/connectors                    — list all connectors (scoped by team_id if authenticated)
  POST   /api/connectors                    — create a new connector
  GET    /api/connectors/{id}               — get connector details
  PUT    /api/connectors/{id}               — update connector config
  DELETE /api/connectors/{id}               — delete connector
  POST   /api/connectors/{id}/test          — test credentials (no data fetch)
  POST   /api/connectors/{id}/sync          — trigger a sync run (blocking, streamed progress)
  GET    /api/connectors/{id}/runs          — list recent sync runs
  GET    /api/connectors/runs/{run_id}      — get run details and per-item log
"""
from __future__ import annotations

import base64
import json
import logging
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.database.db import get_session
from backend.models.connector import ConnectorRun, DataConnector
from backend.services.citation_service import ABSTAIN_THRESHOLD

logger = logging.getLogger(__name__)
router = APIRouter(tags=["connectors"])


# ── Request / response schemas ─────────────────────────────────────────────────

class ConnectorCreate(BaseModel):
    name: str
    connector_type: str     # jira | confluence | github | testrail
    base_url: str
    email: str = ""
    api_token: str = ""     # plain text; we encode to base64 before storage
    project_keys: str = ""
    space_keys: str = ""
    extra_config: str = "{}"
    team_id: Optional[str] = None


class ConnectorUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    email: Optional[str] = None
    api_token: Optional[str] = None
    project_keys: Optional[str] = None
    space_keys: Optional[str] = None
    extra_config: Optional[str] = None
    is_active: Optional[bool] = None


class ConnectorOut(BaseModel):
    id: str
    name: str
    connector_type: str
    base_url: str
    email: str
    project_keys: str
    space_keys: str
    is_active: bool
    team_id: Optional[str]
    last_sync_at: Optional[datetime]
    last_sync_status: str
    last_sync_count: int
    created_at: datetime


class RunOut(BaseModel):
    id: str
    connector_id: str
    started_at: datetime
    completed_at: Optional[datetime]
    status: str
    items_fetched: int
    items_ingested: int
    items_failed: int
    error: Optional[str]


def _encode_token(plain: str) -> str:
    return base64.b64encode(plain.encode()).decode()


def _decode_token(enc: str) -> str:
    try:
        return base64.b64decode(enc.encode()).decode()
    except Exception:
        return enc


def _to_out(c: DataConnector) -> ConnectorOut:
    return ConnectorOut(
        id=c.id, name=c.name, connector_type=c.connector_type,
        base_url=c.base_url, email=c.email, project_keys=c.project_keys,
        space_keys=c.space_keys, is_active=c.is_active, team_id=c.team_id,
        last_sync_at=c.last_sync_at, last_sync_status=c.last_sync_status,
        last_sync_count=c.last_sync_count, created_at=c.created_at,
    )


# ── CRUD endpoints ─────────────────────────────────────────────────────────────

@router.get("/api/connectors", response_model=List[ConnectorOut])
def list_connectors(
    team_id: Optional[str] = None,
    db: Session = Depends(get_session),
):
    stmt = select(DataConnector).where(DataConnector.is_active == True)
    if team_id:
        stmt = stmt.where(DataConnector.team_id == team_id)
    return [_to_out(c) for c in db.exec(stmt).all()]


@router.post("/api/connectors", response_model=ConnectorOut)
def create_connector(body: ConnectorCreate, db: Session = Depends(get_session)):
    conn = DataConnector(
        name=body.name,
        connector_type=body.connector_type,
        base_url=body.base_url,
        email=body.email,
        api_token_enc=_encode_token(body.api_token) if body.api_token else "",
        project_keys=body.project_keys,
        space_keys=body.space_keys,
        extra_config=body.extra_config,
        team_id=body.team_id,
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    logger.info("Created connector %s (%s)", conn.name, conn.connector_type)
    return _to_out(conn)


@router.get("/api/connectors/{connector_id}", response_model=ConnectorOut)
def get_connector(connector_id: str, db: Session = Depends(get_session)):
    conn = db.get(DataConnector, connector_id)
    if not conn:
        raise HTTPException(404, "Connector not found")
    return _to_out(conn)


@router.put("/api/connectors/{connector_id}", response_model=ConnectorOut)
def update_connector(
    connector_id: str,
    body: ConnectorUpdate,
    db: Session = Depends(get_session),
):
    conn = db.get(DataConnector, connector_id)
    if not conn:
        raise HTTPException(404, "Connector not found")
    if body.name is not None:
        conn.name = body.name
    if body.base_url is not None:
        conn.base_url = body.base_url
    if body.email is not None:
        conn.email = body.email
    if body.api_token is not None:
        conn.api_token_enc = _encode_token(body.api_token)
    if body.project_keys is not None:
        conn.project_keys = body.project_keys
    if body.space_keys is not None:
        conn.space_keys = body.space_keys
    if body.extra_config is not None:
        conn.extra_config = body.extra_config
    if body.is_active is not None:
        conn.is_active = body.is_active
    conn.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(conn)
    return _to_out(conn)


@router.delete("/api/connectors/{connector_id}")
def delete_connector(connector_id: str, db: Session = Depends(get_session)):
    conn = db.get(DataConnector, connector_id)
    if not conn:
        raise HTTPException(404, "Connector not found")
    db.delete(conn)
    db.commit()
    return {"deleted": connector_id}


# ── Test connection ────────────────────────────────────────────────────────────

@router.post("/api/connectors/{connector_id}/test")
def test_connector(connector_id: str, db: Session = Depends(get_session)):
    conn = db.get(DataConnector, connector_id)
    if not conn:
        raise HTTPException(404, "Connector not found")

    api_token = _decode_token(conn.api_token_enc)

    try:
        if conn.connector_type == "jira":
            from backend.services.jira_connector import JiraConnector
            client = JiraConnector(conn.base_url, conn.email, api_token)
            info = client.test_connection()
            return {"status": "ok", "connector_type": "jira", "account": info}

        elif conn.connector_type == "confluence":
            from backend.services.confluence_connector import ConfluenceConnector
            client = ConfluenceConnector(conn.base_url, conn.email, api_token)
            info = client.test_connection()
            return {"status": "ok", "connector_type": "confluence", "account": info}

        elif conn.connector_type == "testrail":
            from backend.services.testrail_connector import TestRailConnector
            client = TestRailConnector(conn.base_url, conn.email, api_token)
            info = client.test_connection()
            return {"status": "ok", "connector_type": "testrail", "account": info}

        elif conn.connector_type == "zephyr":
            from backend.services.zephyr_connector import ZephyrScaleConnector
            pk = conn.project_keys.split(",")[0].strip() if conn.project_keys else ""
            client = ZephyrScaleConnector(conn.base_url, api_token, project_key=pk)
            info = client.test_connection()
            return {"status": "ok", "connector_type": "zephyr", "account": info}

        else:
            return {"status": "ok", "connector_type": conn.connector_type, "account": {}}

    except Exception as exc:
        return {"status": "error", "message": str(exc)[:400]}


# ── Sync trigger ───────────────────────────────────────────────────────────────

@router.post("/api/connectors/{connector_id}/sync")
def sync_connector(
    connector_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_session),
):
    """
    Trigger a background sync. Returns the run_id immediately.
    Poll GET /api/connectors/runs/{run_id} for status.
    """
    conn = db.get(DataConnector, connector_id)
    if not conn:
        raise HTTPException(404, "Connector not found")
    if conn.last_sync_status == "syncing":
        raise HTTPException(409, "A sync is already in progress for this connector")

    run = ConnectorRun(connector_id=connector_id)
    db.add(run)
    conn.last_sync_status = "syncing"
    db.commit()
    db.refresh(run)

    # Use Celery if available, fall back to BackgroundTasks in dev
    from backend.celery_app import enabled as celery_enabled
    if celery_enabled:
        from backend.tasks.connector_tasks import sync_connector_task
        from backend.celery_app import dispatch
        dispatch(sync_connector_task, run.id, connector_id)
    else:
        background_tasks.add_task(_run_sync, run.id, connector_id)
    return {"run_id": run.id, "status": "started", "queue": "celery" if celery_enabled else "background"}


def _run_sync(run_id: str, connector_id: str) -> None:
    """Background task: fetch documents and ingest them into RAG pipeline."""
    from backend.database.db import get_session as _gs
    from sqlmodel import Session as _Sess

    # Open a fresh DB session for the background thread
    from backend.database.db import engine
    with _Sess(engine) as db:
        run = db.get(ConnectorRun, run_id)
        conn = db.get(DataConnector, connector_id)
        if not run or not conn:
            return

        api_token = _decode_token(conn.api_token_enc)
        log_items = []
        items_fetched = items_ingested = items_failed = 0

        try:
            if conn.connector_type == "jira":
                items_fetched, items_ingested, items_failed, log_items = _sync_jira(conn, api_token, db)
            elif conn.connector_type == "confluence":
                items_fetched, items_ingested, items_failed, log_items = _sync_confluence(conn, api_token, db)
            elif conn.connector_type == "testrail":
                items_fetched, items_ingested, items_failed, log_items = _sync_testrail(conn, api_token, db)
            elif conn.connector_type == "zephyr":
                items_fetched, items_ingested, items_failed, log_items = _sync_zephyr(conn, api_token, db)
            else:
                log_items.append({"status": "skipped", "reason": f"unsupported type: {conn.connector_type}"})

            run.status = "done"
            conn.last_sync_status = "done"
            conn.last_sync_at = datetime.utcnow()
            conn.last_sync_count = items_ingested

        except Exception as exc:
            logger.exception("Sync failed for connector %s", connector_id)
            run.status = "failed"
            run.error = str(exc)[:500]
            conn.last_sync_status = "failed"

        run.completed_at = datetime.utcnow()
        run.items_fetched = items_fetched
        run.items_ingested = items_ingested
        run.items_failed = items_failed
        run.log_json = json.dumps(log_items[-500:])  # cap to last 500 items
        db.commit()


def _sync_jira(conn, api_token, db):
    from backend.services.jira_connector import JiraConnector
    from backend.api.routes.ingest import _ingest_text_document
    from backend.graph import neo4j_client
    from backend.graph.graph_builder import GraphBuilder

    client = JiraConnector(conn.base_url, conn.email, api_token)
    project_keys = [k.strip() for k in conn.project_keys.split(",") if k.strip()]
    if not project_keys:
        project_keys = [p["key"] for p in client.list_projects()]

    graph_enabled = neo4j_client.is_enabled()
    builder = GraphBuilder(team_id=conn.team_id or "") if graph_enabled else None

    fetched = ingested = failed = 0
    log = []
    for issue in client.iter_issues(project_keys):
        fetched += 1
        try:
            text = issue.to_text()
            meta = issue.to_metadata(conn.id, conn.team_id)
            _ingest_text_document(
                text=text,
                filename=meta["filename"],
                extra_metadata=meta,
                db=db,
            )
            # Populate Knowledge Graph alongside RAG ingest
            if builder:
                builder.populate_from_jira_issue(issue)
            ingested += 1
            log.append({"key": issue.key, "status": "ok", "graph": graph_enabled})
        except Exception as exc:
            failed += 1
            log.append({"key": issue.key, "status": "error", "error": str(exc)[:200]})

    return fetched, ingested, failed, log


def _sync_confluence(conn, api_token, db):
    from backend.services.confluence_connector import ConfluenceConnector
    from backend.api.routes.ingest import _ingest_text_document

    client = ConfluenceConnector(conn.base_url, conn.email, api_token)
    space_keys = [k.strip() for k in conn.space_keys.split(",") if k.strip()]
    if not space_keys:
        space_keys = [s["key"] for s in client.list_spaces()]

    fetched = ingested = failed = 0
    log = []
    for page in client.iter_space_pages(space_keys):
        fetched += 1
        try:
            text = page.to_text()
            meta = page.to_metadata(conn.id, conn.team_id)
            _ingest_text_document(
                text=text,
                filename=meta["filename"],
                extra_metadata=meta,
                db=db,
            )
            ingested += 1
            log.append({"id": page.page_id, "title": page.title, "status": "ok"})
        except Exception as exc:
            failed += 1
            log.append({"id": page.page_id, "title": page.title, "status": "error", "error": str(exc)[:200]})

    return fetched, ingested, failed, log


def _sync_testrail(conn, api_token, db):
    from backend.services.testrail_connector import TestRailConnector
    from backend.api.routes.ingest import _ingest_text_document

    client = TestRailConnector(conn.base_url, conn.email, api_token)
    fetched = ingested = failed = 0
    log = []
    for case in client.iter_cases():
        fetched += 1
        try:
            meta = case.to_metadata(conn.id, conn.team_id)
            _ingest_text_document(text=case.to_text(), filename=meta["filename"],
                                  extra_metadata=meta, db=db)
            ingested += 1
            log.append({"id": case.case_id, "title": case.title, "status": "ok"})
        except Exception as exc:
            failed += 1
            log.append({"id": case.case_id, "status": "error", "error": str(exc)[:200]})
    return fetched, ingested, failed, log


def _sync_zephyr(conn, api_token, db):
    from backend.services.zephyr_connector import ZephyrScaleConnector
    from backend.api.routes.ingest import _ingest_text_document

    project_keys = [k.strip() for k in conn.project_keys.split(",") if k.strip()]
    fetched = ingested = failed = 0
    log = []
    for pk in (project_keys or [""]):
        client = ZephyrScaleConnector(conn.base_url, api_token, project_key=pk)
        for tc in client.iter_test_cases(project_key=pk or None):
            fetched += 1
            try:
                meta = tc.to_metadata(conn.id, conn.team_id)
                _ingest_text_document(text=tc.to_text(), filename=meta["filename"],
                                      extra_metadata=meta, db=db)
                ingested += 1
                log.append({"key": tc.key, "title": tc.name, "status": "ok"})
            except Exception as exc:
                failed += 1
                log.append({"key": tc.key, "status": "error", "error": str(exc)[:200]})
    return fetched, ingested, failed, log


# ── Run history ────────────────────────────────────────────────────────────────

@router.get("/api/connectors/{connector_id}/runs", response_model=List[RunOut])
def list_runs(connector_id: str, limit: int = 20, db: Session = Depends(get_session)):
    stmt = (
        select(ConnectorRun)
        .where(ConnectorRun.connector_id == connector_id)
        .order_by(ConnectorRun.started_at.desc())
        .limit(limit)
    )
    return [_run_to_out(r) for r in db.exec(stmt).all()]


@router.get("/api/connectors/runs/{run_id}", response_model=RunOut)
def get_run(run_id: str, db: Session = Depends(get_session)):
    run = db.get(ConnectorRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return _run_to_out(run)


@router.get("/api/connectors/runs/{run_id}/log")
def get_run_log(run_id: str, db: Session = Depends(get_session)):
    run = db.get(ConnectorRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    try:
        return {"run_id": run_id, "log": json.loads(run.log_json or "[]")}
    except json.JSONDecodeError:
        return {"run_id": run_id, "log": []}


def _run_to_out(r: ConnectorRun) -> RunOut:
    return RunOut(
        id=r.id, connector_id=r.connector_id, started_at=r.started_at,
        completed_at=r.completed_at, status=r.status,
        items_fetched=r.items_fetched, items_ingested=r.items_ingested,
        items_failed=r.items_failed, error=r.error,
    )
