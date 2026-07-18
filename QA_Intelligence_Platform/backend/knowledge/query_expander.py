"""Query expansion — expands abbreviations and adds domain synonyms before retrieval."""
from __future__ import annotations

_ABBREVIATIONS: dict[str, str] = {
    "tc":   "test case",
    "ts":   "test suite",
    "prd":  "product requirements document",
    "brd":  "business requirements document",
    "srs":  "software requirements specification",
    "rca":  "root cause analysis",
    "rtm":  "requirements traceability matrix",
    "ci":   "continuous integration",
    "cd":   "continuous deployment",
    "e2e":  "end to end",
    "ui":   "user interface",
    "api":  "application programming interface",
    "db":   "database",
    "qa":   "quality assurance",
    "atc":  "automation test case",
}

_SYNONYMS: dict[str, list[str]] = {
    "bug":      ["defect", "issue", "error", "failure"],
    "test":     ["spec", "scenario", "case"],
    "fail":     ["broken", "error", "exception", "crash"],
    "selenium": ["webdriver", "selenium webdriver"],
    "playwright": ["pw", "playwright test"],
}


class QueryExpander:
    def expand(self, query: str) -> str:
        """Expand abbreviations and add one synonym per keyword found."""
        words = query.split()
        expanded = []
        for word in words:
            lower = word.lower().rstrip(".,?!")
            if lower in _ABBREVIATIONS:
                expanded.append(_ABBREVIATIONS[lower])
            elif lower in _SYNONYMS:
                expanded.append(word + " " + _SYNONYMS[lower][0])
            else:
                expanded.append(word)
        return " ".join(expanded)
