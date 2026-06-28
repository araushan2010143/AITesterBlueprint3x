# v3.1 — AI Root Cause Analysis + Fix Suggestions

## What This Version Adds
- **Root Cause Analyzer v3.1**: classifies every failed endpoint by category (schema / assertion / SLA / status-code / connectivity)
- **Regression detection**: queries SQLite history to tell you if this is a NEW regression or a persistent/flaky issue
- **Severity scoring**: CRITICAL → HIGH → MEDIUM → LOW, sorted so the worst failures appear first
- **Actionable fix suggestions**: 3–5 specific fixes per failure type, not generic advice
- **Known-fix overrides**: supply a JSON map of regex → custom fix hint for your team's recurring patterns
- **Demo failure scenarios**: `examples/demo_failing_inputs.json` lets you trigger failures intentionally to see RCA in action

## Flow
```
Chat Input
    ↓
API Test Suite v2.2
    ↓
Historical Dashboard v3.0
    ↓
Root Cause Analyzer v3.1   ← NEW NODE
    ↓
Prompt Template (updated)
    ↓
Groq LLM
    ↓
Chat Output
```

## New Node: Root Cause Analyzer v3.1

| Input | Default | Description |
|-------|---------|-------------|
| Enriched Summary | wired | Wire from Historical Dashboard v3.0 output |
| Database Path | reports/history.db | Same SQLite DB as Historical Dashboard |
| Known Fix Patterns (JSON) | {} | Optional: `{"401": "Check token expiry in Vault"}` |

**Output**: `RCA Report` → wire to Prompt Template variable `{rca_report}`

## Step-by-Step Setup in Langflow

### 1. Import v3.0 flow as starting point
1. Open Langflow → click **Import** → choose `v3/v3.0_CI_CD_Dashboard/flow/v3.0.langflow.json`

### 2. Add Root Cause Analyzer v3.1
1. Click **+ Custom Component**
2. Paste the full code from `root_cause_analyzer_v3_1.py`
3. Click **Check & Save** → node appears as **Root Cause Analyzer v3.1**

### 3. Wire the new node
Insert it between Historical Dashboard and Prompt Template:
```
Historical Dashboard v3.0  [Enriched Summary output]
        ↓
Root Cause Analyzer v3.1   [Enriched Summary input]
        ↓
Prompt Template            [rca_report variable]
```

Disconnect the old wire from Historical Dashboard → Prompt Template, then:
- **Historical Dashboard** `Enriched Summary` → **Root Cause Analyzer** `Enriched Summary`
- **Root Cause Analyzer** `RCA Report` → **Prompt Template** `rca_report`

### 4. Replace Prompt Template content
Delete the existing prompt and paste this exact text:

```
You are a senior QA architect specializing in API reliability and root cause analysis.

Read the Root Cause Analysis report below and produce a structured incident report in EXACTLY this format (use plain text, no extra markdown headers):

=== API CONTRACT VALIDATION INCIDENT REPORT ===
Timestamp: <timestamp from report>
Environment: <env>
Overall Status: HEALTHY / DEGRADED / CRITICAL

EXECUTIVE SUMMARY:
<2-3 sentences: what happened, how many endpoints failed, overall health>

FAILURE ANALYSIS:
<repeat for each failure found in the report>
  Endpoint: <METHOD /path>
  Severity: <CRITICAL / HIGH / MEDIUM / LOW>
  Root Cause: <specific explanation of WHY it failed — reference the categories and checks>
  Business Impact: <what does this failure mean for users or downstream systems?>
  Fix Priority: IMMEDIATE / WITHIN 24H / NEXT SPRINT
  Recommended Steps:
    1. <first action>
    2. <second action>
    3. <third action if needed>

REGRESSION REPORT:
<list endpoints marked as REGRESSION with the last-passing timestamp>
<or write "No regressions detected" if all failures are PERSISTENT or FLAKY>

HISTORICAL CONTEXT:
<reference the overall avg pass rate and historical trends to explain if this is getting worse>

IMMEDIATE ACTION ITEMS:
<numbered list — 3 to 5 concrete next steps the team should take right now>

---
Root Cause Analysis:
{rca_report}
```

> **Important**: `{rca_report}` is the ONLY variable in `{curly braces}` — everything else uses angle brackets.

### 5. Test in Playground

**Happy path (all pass):**
- Use the working schemas/assertions from v3.0
- The RCA node outputs "No failures detected" and the LLM confirms healthy status

**Failure demo:**
1. Open `examples/demo_failing_inputs.json`
2. Copy a scenario's `Schemas (JSON)` and paste it into API Test Suite v2.2
3. Copy the matching `Assertions (JSON)` and `SLA Thresholds (JSON)`
4. Run in Playground → see failures → watch RCA classify and suggest fixes
5. Restore working config from `working_config_restore` section when done

## Failure Categories

| Category | Severity | Description |
|----------|----------|-------------|
| connectivity | CRITICAL | Can't reach the endpoint at all |
| status_5xx | CRITICAL | Server returned 500/502/503/504 |
| status_4xx | HIGH | 401 Unauthorized, 403 Forbidden, 404 Not Found |
| schema_missing | HIGH | Required field absent from response |
| schema_type | MEDIUM | Field present but wrong type |
| assertion | MEDIUM | Custom assertion condition not met |
| sla | LOW | Response time exceeded threshold |

## Regression Types

| Type | Meaning |
|------|---------|
| REGRESSION | Was passing last run — a recent change broke it |
| PERSISTENT | Failing across all recent runs — config/env issue |
| FLAKY | Intermittent pass/fail — race condition or external dep |
| NO_HISTORY | First time this endpoint has run |

## Known Fix Patterns (advanced)
Wire custom fixes for your team's recurring issues:
```json
{
  "POST.*auth": "Token in this environment rotates every 15 min — regenerate from Vault before run",
  "GET.*booking": "Booking IDs reset nightly in QA — run create-booking first",
  "PUT.*": "PUT requests need X-API-Version header in this env"
}
```

## Version Roadmap

| Version | Feature | Status |
|---------|---------|--------|
| v1.0 | cURL Parser + API Executor | ✅ |
| v1.1 | Auth + Variable Resolution | ✅ |
| v1.2 | JSON Schema + Assertions | ✅ |
| v1.3 | Reports + LLM Explainer | ✅ |
| v2.0 | OpenAPI / Postman Import | ✅ |
| v2.1 | Performance Metrics + Retry | ✅ |
| v2.2 | Environment Profiles + Parallel | ✅ |
| v3.0 | CI/CD + Historical Dashboard | ✅ |
| v3.1 | AI Root Cause Analysis | ✅ |
