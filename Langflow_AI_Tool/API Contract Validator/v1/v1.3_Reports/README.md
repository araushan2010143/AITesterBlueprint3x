# v1.3 — Report Generator (HTML + JSON + Markdown)

## What This Version Adds
- HTML dashboard with PASS/FAIL badges, duration, check details
- JSON report for CI/CD consumption
- Markdown report for GitHub PRs and wikis
- LLM Root Cause Analyzer explains each failure

## Flow
```
... Contract Validator → Report Generator → LLM Explainer → Chat Output
```

## Report Output
Each run generates 3 files in `reports/`:
- `report_<timestamp>.html` — visual dashboard
- `report_<timestamp>.json` — machine readable
- `report_<timestamp>.md`   — GitHub friendly

## LLM Explainer Output Example
```
POST /booking — FAIL

Root Cause: Field `totalprice` returned as string "150" instead of integer 150.
Impact: Consumers doing arithmetic on price will get NaN errors.
Fix: Ensure the booking service serializes totalprice as Integer, not String.
```
