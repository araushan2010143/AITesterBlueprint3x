"""
Virus scan — optional ClamAV integration.

Two scan backends (tried in order):
  1. pyclamd   — connects to clamd socket/TCP (preferred)
  2. clamscan  — subprocess call to clamscan binary

When neither is available, scan_file() returns clean=True, method="disabled"
(graceful no-op — the upload proceeds without blocking).

Quick-start (Docker):
  docker run -d -p 3310:3310 clamav/clamav:stable
  CLAMD_HOST=localhost  # or a unix socket path
  pip install pyclamd   # optional Python binding
"""
import logging
import os
import subprocess
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class VirusScanResult:
    clean: bool
    threat_name: Optional[str]
    scan_method: str   # "pyclamd" | "clamscan" | "disabled"

    def to_dict(self) -> dict:
        return {
            "clean": self.clean,
            "threat_name": self.threat_name,
            "scan_method": self.scan_method,
        }


# ── Backend detection (module-level, evaluated once) ──────────────────────────

_PYCLAMD_AVAILABLE = False
_CLAMSCAN_AVAILABLE = False

try:
    import pyclamd as _pyclamd  # type: ignore
    _PYCLAMD_AVAILABLE = True
except ImportError:
    pass

try:
    _proc = subprocess.run(
        ["clamscan", "--version"],
        capture_output=True, timeout=5,
    )
    if _proc.returncode == 0:
        _CLAMSCAN_AVAILABLE = True
except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
    pass


def is_enabled() -> bool:
    """Return True if at least one ClamAV backend is available."""
    return _PYCLAMD_AVAILABLE or _CLAMSCAN_AVAILABLE


def _clamd_client():
    """Return a connected pyclamd client, or None on any failure."""
    if not _PYCLAMD_AVAILABLE:
        return None
    try:
        host = os.getenv("CLAMD_HOST", "localhost")
        port = int(os.getenv("CLAMD_PORT", "3310"))
        if host.startswith("/"):
            cd = _pyclamd.ClamdUnixSocket(filename=host)
        else:
            cd = _pyclamd.ClamdNetworkSocket(host=host, port=port)
        cd.ping()
        return cd
    except Exception:
        return None


def scan_file(file_path: str) -> VirusScanResult:
    """
    Scan file_path for viruses/malware.

    Priority:
      1. pyclamd (fast, stream-based)
      2. clamscan subprocess (slower, no daemon needed)
      3. disabled fallback — returns clean=True without scanning

    The disabled fallback is intentional: a missing scan daemon should not
    permanently block uploads. Operators who require mandatory scanning
    should set VIRUS_SCAN_REQUIRED=true (handled in the ingest route).
    """
    if not is_enabled():
        return VirusScanResult(clean=True, threat_name=None, scan_method="disabled")

    # ── pyclamd path ──────────────────────────────────────────────────────────
    if _PYCLAMD_AVAILABLE:
        cd = _clamd_client()
        if cd:
            try:
                result = cd.scan_file(file_path)
                # result is None → clean; {path: ("FOUND", "ThreatName")} → infected
                if result is None:
                    return VirusScanResult(clean=True, threat_name=None, scan_method="pyclamd")
                threat = list(result.values())[0][1] if result else None
                return VirusScanResult(
                    clean=(threat is None),
                    threat_name=threat,
                    scan_method="pyclamd",
                )
            except Exception as exc:
                logger.warning("pyclamd scan failed, falling back to clamscan: %s", exc)

    # ── clamscan subprocess path ──────────────────────────────────────────────
    if _CLAMSCAN_AVAILABLE:
        try:
            proc = subprocess.run(
                ["clamscan", "--no-summary", file_path],
                capture_output=True, text=True, timeout=60,
            )
            clean = proc.returncode == 0
            threat_name: Optional[str] = None
            if not clean:
                for line in proc.stdout.splitlines():
                    if "FOUND" in line:
                        # "path/file.ext: ThreatName FOUND"
                        threat_name = line.split(":", 1)[-1].strip().replace(" FOUND", "")
                        break
            return VirusScanResult(clean=clean, threat_name=threat_name, scan_method="clamscan")
        except subprocess.TimeoutExpired:
            logger.error("clamscan timed out for %s — treating as unclean", file_path)
            return VirusScanResult(clean=False, threat_name="scan_timeout", scan_method="clamscan")
        except Exception as exc:
            logger.warning("clamscan subprocess failed: %s", exc)

    # Both backends failed — fail open so scan infrastructure issues don't
    # permanently block uploads. Log a warning for operators to investigate.
    logger.warning("All virus scan backends failed for %s — proceeding without scan", file_path)
    return VirusScanResult(clean=True, threat_name=None, scan_method="disabled")
