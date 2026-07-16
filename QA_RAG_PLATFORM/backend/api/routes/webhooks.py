"""
Outgoing webhook management API.

Endpoints:
  GET    /api/webhooks                       — list webhooks (team-scoped)
  POST   /api/webhooks                       — create webhook
  GET    /api/webhooks/{id}                  — get webhook detail
  PUT    /api/webhooks/{id}                  — update webhook config
  DELETE /api/webhooks/{id}                  — delete webhook
  POST   /api/webhooks/{id}/test             — send test ping event
  GET    /api/webhooks/{id}/deliveries       — list recent deliveries
  POST   /api/webhooks/deliveries/{id}/retry — retry a failed delivery
  GET    /api/webhooks/events                — list all supported event types

Supported events:
  document.ingested          — new document processed into knowledge base
  connector.sync.done        — connector sync completed
  connector.sync.failed      — connector sync failed
  agent.run.done             — agent task completed (any agent)
  agent.rca.done             — RCA agent completed
  agent.impact.done          — impact analysis completed
  graph.populated            — graph population completed
  webhook.test               — test ping (used by POST /test)
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.database.db import get_session
from backend.models.webhook import WebhookConfig, WebhookDelivery

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])

SUPPORTED_EVENTS = [
    "document.ingested",
    "connector.sync.done",
    "connector.sync.failed",
    "agent.run.done",
    "agent.rca.done",
    "agent.impact.done",
    "graph.populated",
    "webhook.test",
    "*",
]


# ── Request schemas ────────────────────────────────────────────────────────────

class WebhookCreate(BaseModel):
    name: str
    url: str
    secret: str = ""
    events: str = "*"
    team_id: Optional[str] = None
    created_by: Optional[str] = None


class WebhookUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    secret: Optional[str] = None
    events: Optional[str] = None
    is_active: Optional[bool] = None


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("/events")
def list_events():
    return {"events": SUPPORTED_EVENTS}


@router.get("", response_model=List[dict])
def list_webhooks(
    team_id: Optional[str] = Query(None),
    db: Session = Depends(get_session),
):
    stmt = select(WebhookConfig)
    if team_id:
        stmt = stmt.where(WebhookConfig.team_id == team_id)
    return [_to_dict(w) for w in db.exec(stmt).all()]


@router.post("", response_model=dict)
def create_webhook(body: WebhookCreate, db: Session = Depends(get_session)):
    if not body.url.startswith("https://") and not body.url.startswith("http://"):
        raise HTTPException(400, "Webhook URL must start with http:// or https://")
    wh = WebhookConfig(
        name=body.name, url=body.url, secret=body.secret,
        events=body.events, team_id=body.team_id, created_by=body.created_by,
    )
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return _to_dict(wh)


@router.get("/{webhook_id}", response_model=dict)
def get_webhook(webhook_id: str, db: Session = Depends(get_session)):
    wh = db.get(WebhookConfig, webhook_id)
    if not wh:
        raise HTTPException(404, "Webhook not found")
    return _to_dict(wh)


@router.put("/{webhook_id}", response_model=dict)
def update_webhook(webhook_id: str, body: WebhookUpdate, db: Session = Depends(get_session)):
    wh = db.get(WebhookConfig, webhook_id)
    if not wh:
        raise HTTPException(404, "Webhook not found")
    if body.name is not None:     wh.name = body.name
    if body.url is not None:      wh.url = body.url
    if body.secret is not None:   wh.secret = body.secret
    if body.events is not None:   wh.events = body.events
    if body.is_active is not None: wh.is_active = body.is_active
    wh.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(wh)
    return _to_dict(wh)


@router.delete("/{webhook_id}")
def delete_webhook(webhook_id: str, db: Session = Depends(get_session)):
    wh = db.get(WebhookConfig, webhook_id)
    if not wh:
        raise HTTPException(404, "Webhook not found")
    db.delete(wh)
    db.commit()
    return {"deleted": webhook_id}


# ── Test ping ─────────────────────────────────────────────────────────────────

@router.post("/{webhook_id}/test")
def test_webhook(
    webhook_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_session),
):
    """Send a test ping event to verify the webhook endpoint is reachable."""
    wh = db.get(WebhookConfig, webhook_id)
    if not wh:
        raise HTTPException(404, "Webhook not found")
    payload = {"webhook_id": webhook_id, "name": wh.name, "message": "Test ping from QA RAG Platform"}
    delivery = WebhookDelivery(
        webhook_id=webhook_id,
        event_type="webhook.test",
        payload_json=json.dumps({"event": "webhook.test", "data": payload,
                                 "timestamp": datetime.utcnow().isoformat()}),
    )
    db.add(delivery)
    db.commit()
    db.refresh(delivery)
    background_tasks.add_task(_deliver, delivery.id)
    return {"status": "queued", "delivery_id": delivery.id}


# ── Deliveries ────────────────────────────────────────────────────────────────

@router.get("/{webhook_id}/deliveries")
def list_deliveries(
    webhook_id: str,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_session),
):
    stmt = (
        select(WebhookDelivery)
        .where(WebhookDelivery.webhook_id == webhook_id)
        .order_by(WebhookDelivery.created_at.desc())
        .limit(limit)
    )
    return [_delivery_dict(d) for d in db.exec(stmt).all()]


@router.post("/deliveries/{delivery_id}/retry")
def retry_delivery(delivery_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_session)):
    delivery = db.get(WebhookDelivery, delivery_id)
    if not delivery:
        raise HTTPException(404, "Delivery not found")
    if delivery.status == "delivered":
        return {"status": "already_delivered"}
    delivery.status = "pending"
    delivery.attempt_count = 0
    db.commit()
    background_tasks.add_task(_deliver, delivery_id)
    return {"status": "retrying", "delivery_id": delivery_id}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _deliver(delivery_id: str) -> None:
    from backend.tasks.webhook_tasks import _do_deliver
    _do_deliver(delivery_id)


def _to_dict(wh: WebhookConfig) -> dict:
    return {
        "id": wh.id, "name": wh.name, "url": wh.url,
        "events": wh.events, "is_active": wh.is_active,
        "team_id": wh.team_id, "created_by": wh.created_by,
        "total_deliveries": wh.total_deliveries,
        "failed_deliveries": wh.failed_deliveries,
        "last_triggered_at": wh.last_triggered_at.isoformat() if wh.last_triggered_at else None,
        "created_at": wh.created_at.isoformat(),
        # Never expose secret in API response
        "secret_configured": bool(wh.secret),
    }


def _delivery_dict(d: WebhookDelivery) -> dict:
    return {
        "id": d.id, "webhook_id": d.webhook_id, "event_type": d.event_type,
        "status": d.status, "response_status": d.response_status,
        "response_body": d.response_body, "attempt_count": d.attempt_count,
        "created_at": d.created_at.isoformat(),
        "delivered_at": d.delivered_at.isoformat() if d.delivered_at else None,
    }
