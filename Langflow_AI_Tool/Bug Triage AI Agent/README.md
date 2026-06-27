# Universal Bug Triage AI Agent

A production-ready, multi-tracker AI agent that automatically triages bugs from any issue tracker — Jira, GitHub Issues, Azure DevOps, GitLab, Linear, or YouTrack — into structured, actionable intelligence.

## Architecture

```
Raw Bug JSON (any tracker)
        │
        ▼
┌─────────────────────────┐
│  Bug Connector &        │  Detects tracker, normalizes
│  Normalizer             │  to canonical 18-field schema
└──────────┬──────────────┘
           │ canonical_bug
     ┌─────┼─────┐
     ▼     ▼     ▼
┌────────┐ ┌──────────────────┐
│  Risk  │ │ Duplicate        │
│ Scorer │ │ Detector (TF-IDF)│
└───┬────┘ └────────┬─────────┘
    │ risk_report   │ similar_bugs
    └──────┬────────┘
           ▼
┌──────────────────────────┐
│  Bug Intelligence Prompt │  Assembles context for LLM
│  (Prompt Builder)        │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  Groq LLM                │  llama-3.3-70b-versatile
│  (llama-3.3-70b)         │  Fast inference, JSON output
└──────────┬───────────────┘
           │ triage_json
           ▼
┌──────────────────────────┐
│  Confidence Router       │  ≥0.80 → AUTO_ACTION
│                          │  <0.80 → HUMAN_REVIEW
└──────────┬───────────────┘
           │
           ▼
     Final Decision JSON
```

## Components

| File | Purpose |
|------|---------|
| `components/BugConnectorNormalizer.py` | Detects tracker type, normalizes to canonical schema |
| `components/RiskScoringEngine.py` | Deterministic keyword + environment risk scoring |
| `components/DuplicateDetector.py` | TF-IDF cosine similarity duplicate detection |
| `components/ConfidenceRouter.py` | Routes to auto-action or human review |
| `prompts/bug_intelligence_prompt.txt` | LLM system prompt for triage analysis |
| `schemas/triage_output_schema.json` | JSON Schema for validating LLM output |
| `knowledge_base/historical_bugs.json` | Historical resolved bugs for duplicate detection |
| `bug_triage_agent.langflow.json` | Langflow flow wiring all components |

## Supported Trackers

| Tracker | Detection Signal |
|---------|----------------|
| **GitHub Issues** | `number` + `node_id` fields |
| **Jira** | `fields` + `atlassian.net` URL |
| **Azure DevOps** | `System.WorkItemType` field |
| **GitLab Issues** | `iid` + `project_id` fields |
| **Linear** | `identifier` + `team` fields |
| **YouTrack** | `idReadable` + `summary` fields |

## Canonical Bug Schema

All trackers normalize to 18 fields:

```json
{
  "bug_id": "GH-4821",
  "tracker": "GitHub Issues",
  "title": "...",
  "description": "...",
  "comments": ["..."],
  "attachments": [],
  "labels": ["bug", "production"],
  "priority": "Critical",
  "severity": "Unknown",
  "status": "Open",
  "assignee": "alice",
  "reporter": "bob",
  "environment": "production",
  "component": "Checkout",
  "created_at": "2026-06-27T14:23:11Z",
  "updated_at": "2026-06-27T16:01:44Z",
  "url": "https://github.com/...",
  "custom_fields": {}
}
```

## Triage Output Schema

```json
{
  "severity": "CRITICAL",
  "priority": "P1",
  "risk_level": "CRITICAL",
  "confidence": 0.93,
  "regression": true,
  "regression_introduced_by": "deploy-v2.4.0",
  "root_cause_category": "configuration_error",
  "root_cause_hypothesis": "Stripe env var not updated after secret rotation...",
  "customer_impact": "High",
  "customer_impact_description": "All checkout attempts fail, ~120 users affected",
  "business_impact": ["Revenue", "Availability"],
  "duplicate_probability": 0.82,
  "is_likely_duplicate": true,
  "related_issue_ids": ["GH-3201"],
  "recommended_owner": "Backend / Payments Team",
  "suggested_labels": ["bug", "production", "payment", "regression", "p1"],
  "recommended_action": "ASSIGN_AND_ESCALATE",
  "action_rationale": "P1 revenue impact with high confidence...",
  "estimated_fix_priority": "Immediate (<4h)",
  "sla_breach_risk": true,
  "ai_notes": "Similar to GH-3201 — check Stripe env var rotation."
}
```

## Routing Logic

| Condition | Route |
|-----------|-------|
| confidence ≥ 0.80 | `AUTO_ACTION` — auto-apply priority, severity, assignee, labels, notify Slack |
| confidence < 0.80 | `HUMAN_REVIEW` — flag for manual triage |
| Critical regression (any confidence) | `HUMAN_REVIEW` — mandatory escalation |

## Risk Scoring Rules

| Signal | Points |
|--------|--------|
| Production environment | +25 |
| Critical/Blocker priority | +20 |
| Security keywords | +20 |
| Revenue/payment keywords | +15 |
| Infra/outage keywords | +12 |
| Critical severity | +10 |
| Data integrity keywords | +10 |
| Regression keywords | +8 |
| Auth keywords | +8 |
| High-risk component | +7 |

Score → Priority: P1 (≥75) · P2 (≥55) · P3 (≥35) · P4 (<35)

## Setup

### 1. Load into Langflow

1. Open your Langflow instance
2. Click **Import Flow** → upload `bug_triage_agent.langflow.json`
3. Copy `components/*.py` files to your Langflow custom components directory

### 2. Configure Groq

Set `GROQ_API_KEY` in the Groq LLM node (or as a Langflow environment variable).

### 3. Load Knowledge Base

Paste the contents of `knowledge_base/historical_bugs.json` into the **Knowledge Base Input** node.

### 4. Test

Paste any of the sample bugs from `sample_bugs/` into the **Raw Bug Input** node and run the flow.

## Sample Bugs

| File | Tracker | Scenario |
|------|---------|---------|
| `sample_bugs/github_issue.json` | GitHub | P1 checkout crash, revenue impact |
| `sample_bugs/jira_issue.json` | Jira | P1 SSO SAML failure, all enterprise users |
| `sample_bugs/azure_devops_issue.json` | Azure DevOps | P1 memory leak causing OOM |
| `sample_bugs/gitlab_issue.json` | GitLab | Critical XSS security vulnerability |
| `sample_bugs/linear_issue.json` | Linear | P3 dark mode UX issue, data loss |

## Adding More Historical Bugs

Add entries to `knowledge_base/historical_bugs.json`:

```json
{
  "id": "YOUR-123",
  "title": "Brief bug title",
  "description": "Full bug description for similarity matching",
  "root_cause": "What caused it",
  "resolution": "How it was fixed",
  "component": "Component name",
  "severity": "HIGH",
  "status": "Resolved",
  "tags": ["label1", "label2"]
}
```

The TF-IDF engine will automatically consider new entries in duplicate detection.
