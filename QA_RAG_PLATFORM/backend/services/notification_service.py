"""Notification service — webhook POST and SMTP email on job completion."""
from __future__ import annotations
import json
import logging
import os
import smtplib
import ssl
import urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# ── SMTP settings (all optional; notifications silently skipped if not set) ──
_SMTP_HOST = os.getenv("SMTP_HOST", "")
_SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
_SMTP_USER = os.getenv("SMTP_USER", "")
_SMTP_PASS = os.getenv("SMTP_PASS", "")
_SMTP_FROM = os.getenv("SMTP_FROM", _SMTP_USER)


def notify_job_done(
    job_id: str,
    source_name: str,
    status: str,
    completed: int,
    failed: int,
    total: int,
    webhook_url: Optional[str] = None,
    notify_email: Optional[str] = None,
) -> None:
    """Fire webhook and/or email — errors are logged, never raised."""
    payload: Dict[str, Any] = {
        "event": "migration.job.done",
        "job_id": job_id,
        "source": source_name,
        "status": status,
        "files": {"total": total, "completed": completed, "failed": failed},
        "success_rate": round(completed / total * 100, 1) if total else 0,
    }

    if webhook_url and webhook_url.strip():
        _post_webhook(webhook_url.strip(), payload)

    if notify_email and notify_email.strip():
        _send_email(notify_email.strip(), payload)


def _post_webhook(url: str, payload: dict) -> None:
    try:
        body = json.dumps(payload).encode()
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "User-Agent": "QA-RAG-Platform/3.1"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            logger.info("Webhook delivered: %s → %s", url, resp.status)
    except Exception as exc:
        logger.warning("Webhook failed (%s): %s", url, exc)


def _send_email(to_email: str, payload: dict) -> None:
    if not _SMTP_HOST:
        logger.debug("SMTP_HOST not set — skipping email notification")
        return

    status = payload["status"]
    job_id = payload["job_id"][:8]
    source = payload["source"]
    completed = payload["files"]["completed"]
    total = payload["files"]["total"]
    failed = payload["files"]["failed"]
    rate = payload["success_rate"]

    status_emoji = "✅" if status == "done" else "⚠️" if status == "partial" else "❌"

    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0f1521;color:#cdd9f5;padding:28px;border-radius:12px">
      <div style="font-size:22px;font-weight:700;margin-bottom:4px">{status_emoji} Migration {status.title()}</div>
      <div style="font-size:12px;color:#6b7fa8;margin-bottom:24px">Job {job_id} · {source}</div>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#6b7fa8;font-size:12px">Files Migrated</td><td style="font-size:14px;font-weight:700;font-family:monospace">{completed}/{total}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7fa8;font-size:12px">Failed Files</td><td style="font-size:14px;font-family:monospace;color:{'#f43f5e' if failed else '#10b981'}">{failed}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7fa8;font-size:12px">Success Rate</td><td style="font-size:14px;font-weight:700;font-family:monospace;color:{'#10b981' if rate>=80 else '#f59e0b'}">{rate}%</td></tr>
      </table>
      <div style="margin-top:20px">
        <a href="#" style="display:inline-block;padding:10px 20px;background:linear-gradient(135deg,#7C3AED,#6D28D9);color:white;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600">View Results →</a>
      </div>
      <div style="margin-top:20px;font-size:10px;color:#374151">Sent by QA RAG Migration Platform</div>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"{status_emoji} Migration {status}: {completed}/{total} files — {source[:50]}"
    msg["From"] = _SMTP_FROM
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html"))

    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP(_SMTP_HOST, _SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls(context=ctx)
            if _SMTP_USER and _SMTP_PASS:
                server.login(_SMTP_USER, _SMTP_PASS)
            server.sendmail(_SMTP_FROM, [to_email], msg.as_string())
        logger.info("Email notification sent to %s", to_email)
    except Exception as exc:
        logger.warning("Email notification failed: %s", exc)
