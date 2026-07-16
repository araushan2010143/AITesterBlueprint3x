"""
PII + Secret detection for the secure ingestion pipeline.

Scans document text BEFORE chunking / embedding. Two threat tiers:

  TIER 1 — Secrets (always redact):
    AWS keys, GitHub tokens, JWT tokens, private keys, database connection
    strings, Stripe keys, Slack tokens, passwords-in-code, high-entropy strings.

  TIER 2 — PII (configurable: flag | redact | block):
    Email addresses, phone numbers, SSNs, credit card numbers.

Returns:
  ScanResult(clean_text, findings, has_secrets, has_pii, redacted_count)

Config (env vars):
  PII_ACTION   = flag | redact | block   (default: flag)
  SECRET_ACTION = redact | block          (default: redact)
"""
from __future__ import annotations

import logging
import math
import re
import string
from dataclasses import dataclass, field
from typing import List, Optional

logger = logging.getLogger(__name__)

# ── Compiled patterns ─────────────────────────────────────────────────────────

_PII_PATTERNS = [
    # name, compiled regex, replacement placeholder
    ("EMAIL",       re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,7}\b'),       "[EMAIL]"),
    ("PHONE",       re.compile(r'(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b'),             "[PHONE]"),
    ("SSN",         re.compile(r'\b(?!000)(?!666)(?!9\d{2})\d{3}[-\s]?(?!00)\d{2}[-\s]?(?!0000)\d{4}\b'), "[SSN]"),
    ("CREDIT_CARD", re.compile(
        r'\b(?:4[0-9]{12}(?:[0-9]{3})?'           # Visa
        r'|[25][1-7][0-9]{14}'                     # MC
        r'|6(?:011|5[0-9]{2})[0-9]{12}'           # Discover
        r'|3[47][0-9]{13}'                         # AmEx
        r'|3(?:0[0-5]|[68][0-9])[0-9]{11}'        # Diners
        r'|(?:2131|1800|35\d{3})\d{11})\b'        # JCB
    ), "[CREDIT_CARD]"),
    ("IP_ADDRESS",  re.compile(r'\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b'), "[IP]"),
    ("DATE_OF_BIRTH", re.compile(r'\b(?:dob|date.of.birth|born\s*on)\s*[:\-]?\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b', re.IGNORECASE), "[DOB]"),
]

_SECRET_PATTERNS = [
    ("AWS_ACCESS_KEY",    re.compile(r'\bAKIA[0-9A-Z]{16}\b'),                                                 "[AWS_KEY]"),
    ("AWS_MWS_KEY",       re.compile(r'\bamzn\.mws\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b'), "[AWS_MWS_KEY]"),
    ("GITHUB_TOKEN",      re.compile(r'\b(ghp|gho|ghs|ghr)_[A-Za-z0-9]{36}\b'),                              "[GITHUB_TOKEN]"),
    ("GITHUB_PAT",        re.compile(r'\bgithub_pat_[A-Za-z0-9_]{82}\b'),                                     "[GITHUB_PAT]"),
    ("GITLAB_TOKEN",      re.compile(r'\bglpat-[A-Za-z0-9\-_]{20}\b'),                                        "[GITLAB_TOKEN]"),
    ("JWT_TOKEN",         re.compile(r'\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b'), "[JWT]"),
    ("PRIVATE_KEY",       re.compile(r'-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH|PGP|ENCRYPTED)\s+PRIVATE KEY-----', re.IGNORECASE), "[PRIVATE_KEY]"),
    ("PASSWORD_IN_CODE",  re.compile(r'(?i)(?:password|passwd|pwd|secret|api[_\-]?key|apikey|auth[_\-]?token|access[_\-]?token)\s*[=:]\s*["\'][^"\']{4,}["\']'), "[SECRET]"),
    ("DB_CONNECTION",     re.compile(r'(?i)(?:postgresql|mysql|mongodb\+srv|mongodb|redis|mssql|amqp|mariadb):\/\/[^@\s\/]+:[^@\s\/]+@'), "[DB_CRED]"),
    ("STRIPE_KEY",        re.compile(r'\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{24,99}\b'),                  "[STRIPE_KEY]"),
    ("SLACK_TOKEN",       re.compile(r'\bxox[baprs]-[A-Za-z0-9]+-[A-Za-z0-9\-]+\b'),                         "[SLACK_TOKEN]"),
    ("SENDGRID_KEY",      re.compile(r'\bSG\.[A-Za-z0-9\-_]{22,66}\.[A-Za-z0-9\-_]{39,77}\b'),              "[SENDGRID_KEY]"),
    ("TWILIO_KEY",        re.compile(r'\bSK[a-z0-9]{32}\b'),                                                  "[TWILIO_KEY]"),
    ("HEROKU_API_KEY",    re.compile(r'\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b'), "[HEROKU_KEY]"),
    ("GOOGLE_API_KEY",    re.compile(r'\bAIza[0-9A-Za-z\-_]{35}\b'),                                          "[GOOGLE_KEY]"),
    ("AZURE_KEY",         re.compile(r'\b[A-Za-z0-9+/]{43}=\b'),                                              "[AZURE_KEY]"),  # will entropy-check
    ("NPM_TOKEN",         re.compile(r'\bnpm_[A-Za-z0-9]{36}\b'),                                             "[NPM_TOKEN]"),
    ("DOCKER_TOKEN",      re.compile(r'\bdckr_pat_[A-Za-z0-9\-_]{27}\b'),                                     "[DOCKER_TOKEN]"),
]

# ── Entropy scanner ────────────────────────────────────────────────────────────

_B64_CHARSET  = set(string.ascii_letters + string.digits + "+/=")
_HEX_CHARSET  = set(string.hexdigits)
_HIGH_ENTROPY_THRESHOLD = 4.5   # bits — genuine English text is ~4.0; random keys ~5.5+
_MIN_SECRET_LENGTH = 20
_MAX_SECRET_LENGTH = 80

# Regex to find candidate high-entropy strings
_CANDIDATE_RE = re.compile(r'[A-Za-z0-9+/=_\-]{20,80}')


def _shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    from collections import Counter
    counts = Counter(s)
    n = len(s)
    return -sum((c / n) * math.log2(c / n) for c in counts.values())


def _is_high_entropy_secret(candidate: str) -> bool:
    if len(candidate) < _MIN_SECRET_LENGTH or len(candidate) > _MAX_SECRET_LENGTH:
        return False
    charset = set(candidate)
    if not (charset <= _B64_CHARSET or charset <= _HEX_CHARSET):
        return False
    return _shannon_entropy(candidate) >= _HIGH_ENTROPY_THRESHOLD


# ── Result type ───────────────────────────────────────────────────────────────

@dataclass
class Finding:
    type: str          # "SECRET" | "PII"
    category: str      # e.g. "GITHUB_TOKEN", "EMAIL"
    value_preview: str # first 6 chars + *** (never log full value)
    start: int
    end: int
    placeholder: str


@dataclass
class ScanResult:
    clean_text: str
    findings: List[Finding] = field(default_factory=list)

    @property
    def has_secrets(self) -> bool:
        return any(f.type == "SECRET" for f in self.findings)

    @property
    def has_pii(self) -> bool:
        return any(f.type == "PII" for f in self.findings)

    @property
    def redacted_count(self) -> int:
        return len(self.findings)

    def summary(self) -> dict:
        counts: dict = {}
        for f in self.findings:
            counts[f.category] = counts.get(f.category, 0) + 1
        return {
            "has_secrets": self.has_secrets,
            "has_pii": self.has_pii,
            "total_findings": len(self.findings),
            "by_category": counts,
        }


# ── Core scanner ──────────────────────────────────────────────────────────────

def scan_and_redact(
    text: str,
    redact_secrets: bool = True,
    redact_pii: bool = False,
) -> ScanResult:
    """
    Scan text for PII and secrets.

    Args:
        text:           Raw document text.
        redact_secrets: Replace detected secrets with placeholder. Default True.
        redact_pii:     Replace detected PII with placeholder. Default False (flag only).

    Returns:
        ScanResult with clean_text and findings list.
    """
    findings: List[Finding] = []
    working = text

    # ── TIER 1: Secrets ───────────────────────────────────────────────────────
    for name, pattern, placeholder in _SECRET_PATTERNS:
        matches = list(pattern.finditer(working))
        for m in reversed(matches):  # reverse to preserve offsets
            val = m.group()
            # Extra entropy check for patterns that need it (AZURE_KEY, HEROKU_KEY)
            if name in ("AZURE_KEY", "HEROKU_API_KEY") and not _is_high_entropy_secret(val):
                continue
            preview = val[:6] + "***"
            findings.append(Finding(
                type="SECRET", category=name, value_preview=preview,
                start=m.start(), end=m.end(), placeholder=placeholder,
            ))
            if redact_secrets:
                working = working[:m.start()] + placeholder + working[m.end():]

    # ── Entropy-based catch-all ────────────────────────────────────────────────
    for m in reversed(list(_CANDIDATE_RE.finditer(working))):
        val = m.group()
        if _is_high_entropy_secret(val):
            # Don't double-report if already caught by a named pattern
            if not any(f.start <= m.start() <= f.end for f in findings):
                preview = val[:6] + "***"
                findings.append(Finding(
                    type="SECRET", category="HIGH_ENTROPY_STRING", value_preview=preview,
                    start=m.start(), end=m.end(), placeholder="[SECRET]",
                ))
                if redact_secrets:
                    working = working[:m.start()] + "[SECRET]" + working[m.end():]

    # ── TIER 2: PII ───────────────────────────────────────────────────────────
    for name, pattern, placeholder in _PII_PATTERNS:
        matches = list(pattern.finditer(working))
        for m in reversed(matches):
            val = m.group()
            preview = val[:4] + "***"
            findings.append(Finding(
                type="PII", category=name, value_preview=preview,
                start=m.start(), end=m.end(), placeholder=placeholder,
            ))
            if redact_pii:
                working = working[:m.start()] + placeholder + working[m.end():]

    logger.info(
        "PII scan: %d findings (%d secrets, %d PII) in %d chars",
        len(findings),
        sum(1 for f in findings if f.type == "SECRET"),
        sum(1 for f in findings if f.type == "PII"),
        len(text),
    )

    return ScanResult(clean_text=working, findings=findings)


def scan_filename(filename: str) -> List[str]:
    """Flag suspicious filenames (passwords.xlsx, keys.json, etc.)."""
    danger = ["password", "secret", "credential", "private", "key", "token",
              "auth", "config", ".env", "vault", "cert"]
    name_lower = filename.lower()
    return [d for d in danger if d in name_lower]


def findings_to_log(findings: List[Finding]) -> List[dict]:
    """Serialisable summary for audit log — never includes raw values."""
    return [
        {"type": f.type, "category": f.category, "preview": f.value_preview}
        for f in findings
    ]
