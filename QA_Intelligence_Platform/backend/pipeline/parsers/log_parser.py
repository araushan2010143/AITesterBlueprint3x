"""Log parser — reads log files, returns raw text for log chunker."""
from __future__ import annotations
import os


def parse_log(path: str, service: str = "", env: str = "") -> tuple[str, dict]:
    filename = os.path.basename(path)
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    metadata = {
        "source":   "logs",
        "filename": filename,
        "path":     path,
        "service":  service,
        "env":      env,
    }
    return content, metadata
