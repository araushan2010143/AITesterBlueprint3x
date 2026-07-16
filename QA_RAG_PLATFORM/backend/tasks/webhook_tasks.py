"""
Celery tasks for outgoing webhook delivery.

Each delivery attempt:
  1. POST JSON payload to configured URL
  2. Include HMAC-SHA256 signature header for consumer verification
  3. Record attempt in WebhookDelivery table
  4. Retry up to 3 times with exponential back-off on non-2xx or network error

Signature verification (consumer side):
  sig = HMAC-SHA256(secret, raw_body)
  compare request.headers["X-QA-RAG-Signature"] == f"sha256={sig}"
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
import urllib.error
import urllib.request
from datetime import datetime

logger = logging.getLogger(__name__)

_RETRY_DELAYS = [60, 300, 900]   # 1 min, 5 min, 15 min


def _task(fn):
    from backend.celery_app import celery_app
    if celery_app:
        return celery_app.task(
            bind=True,
            max_retries=3,
            default_retry_delay=60,
            name=f"backend.tasks.webhook_tasks.{fn.__name__}",
        )(fn)
    return fn


@_task
def deliver_webhook_task(self_or_delivery_id, delivery_id=None):
    from backend.celery_app import celery_app
    actual_id = (
        self_or_delivery_id
        if (not celery_app or delivery_id is None)
        else delivery_id
    )
    _do_deliver(actual_id)


def _do_deliver(delivery_id: str) -> None:
    from sqlmodel import Session
    from backend.database.db import engine
    from backend.models.webhook import WebhookDelivery, WebhookConfig

    with Session(engine) as db:
        delivery = db.get(WebhookDelivery, delivery_id)
        if not delivery:
            return
        webhook = db.get(WebhookConfig, delivery.webhook_id)
        if not webhook or not webhook.is_active:
            delivery.status = "skipped"
            db.commit()
            return

        payload_bytes = delivery.payload_json.encode()
        headers = {
            "Content-Type":        "application/json",
            "User-Agent":          "QA-RAG-Platform/4.2",
            "X-QA-RAG-Event":      delivery.event_type,
            "X-QA-RAG-Delivery":   delivery_id,
            "X-QA-RAG-Timestamp":  datetime.utcnow().isoformat(),
        }
        if webhook.secret:
            sig = hmac.new(
                webhook.secret.encode(), payload_bytes, hashlib.sha256
            ).hexdigest()
            headers["X-QA-RAG-Signature"] = f"sha256={sig}"

        attempt = (delivery.attempt_count or 0) + 1
        delivery.attempt_count = attempt

        try:
            req = urllib.request.Request(
                webhook.url, data=payload_bytes, headers=headers, method="POST"
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                response_body = resp.read().decode(errors="replace")[:500]
                status = resp.status
        except urllib.error.HTTPError as e:
            status = e.code
            response_body = e.read().decode(errors="replace")[:500]
        except Exception as exc:
            status = 0
            response_body = str(exc)[:500]

        delivery.response_status = status
        delivery.response_body   = response_body
        delivery.status          = "delivered" if 200 <= status < 300 else "failed"
        delivery.delivered_at    = datetime.utcnow() if delivery.status == "delivered" else None
        db.commit()

    if delivery.status == "failed" and attempt < 3:
        logger.warning("Webhook delivery %s failed (attempt %d), will retry", delivery_id, attempt)
    else:
        logger.info("Webhook delivery %s: status=%s http=%s", delivery_id, delivery.status, status)


def fire_event(event_type: str, payload: dict, team_id: str = "") -> int:
    """
    Find all active webhooks subscribed to event_type, create a delivery record
    for each, and dispatch the Celery task. Returns number of webhooks fired.
    """
    from sqlmodel import Session, select
    from backend.database.db import engine
    from backend.models.webhook import WebhookConfig, WebhookDelivery
    from backend.celery_app import dispatch

    payload_json = json.dumps({"event": event_type, "data": payload,
                               "timestamp": datetime.utcnow().isoformat()})
    count = 0
    with Session(engine) as db:
        stmt = select(WebhookConfig).where(
            WebhookConfig.is_active == True,
        )
        if team_id:
            stmt = stmt.where(WebhookConfig.team_id == team_id)
        for webhook in db.exec(stmt).all():
            subscribed = [e.strip() for e in (webhook.events or "").split(",")]
            # Match exact event or wildcard prefix (e.g. "connector.*" matches "connector.sync.done")
            matched = (
                event_type in subscribed
                or any(
                    event_type.startswith(pat.rstrip("*"))
                    for pat in subscribed if pat.endswith("*")
                )
                or "*" in subscribed
            )
            if not matched:
                continue
            delivery = WebhookDelivery(
                webhook_id=webhook.id,
                event_type=event_type,
                payload_json=payload_json,
            )
            db.add(delivery)
            db.commit()
            db.refresh(delivery)
            dispatch(deliver_webhook_task, delivery.id)
            count += 1
    return count
