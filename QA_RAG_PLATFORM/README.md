# QA RAG Platform

> Enterprise QA Intelligence Platform — multi-format RAG pipeline · 12 AI agents · Knowledge Graph · SAML SSO · Live connectors · Celery task queue · HashiCorp Vault

[![Python](https://img.shields.io/badge/python-3.9%2B-3572a5)](./backend)
[![Next.js](https://img.shields.io/badge/next.js-15.3-black)](./frontend)
[![FastAPI](https://img.shields.io/badge/fastapi-0.115-009688)](./backend)
[![Tests](https://img.shields.io/badge/tests-280%2B%20passing-22c55e)]()
[![Coverage](https://img.shields.io/badge/coverage-unit%20%2B%20integration-7c3aed)]()
[![Version](https://img.shields.io/badge/version-7.0.0-7c3aed)]()

---

## What it does

The QA RAG Platform ingests your QA documentation (test cases, requirements, execution reports, API contracts, Jira issues) into a vector database and Knowledge Graph, then lets you query it with natural language and run AI agents that automate the most expensive parts of QA work — with full multi-turn conversation memory, team-scoped ABAC security, and enterprise SSO.

---

## 12 AI Agents

| Agent | What it does |
|---|---|
| **Flaky Test Analyzer** | Upload JUnit XML / Playwright JSON from multiple builds. Probabilistic RCA, 10-class failure classification, flaky score 0–100, before/after code fixes |
| **Generate Test Cases** | Converts requirements into functional, negative, boundary, security, and accessibility test cases |
| **Find Duplicates** | Detects near-duplicate test cases and suggests merge actions |
| **Coverage Analysis** | Maps requirements to test cases, surfaces gaps with risk weighting |
| **Root Cause Analysis** | Analyzes execution reports to find root causes, linked to graph impact data |
| **Release Summary** | Generates professional release readiness reports with graph-derived risk score |
| **Explain Failure** | Analyzes Playwright traces and logs with fix suggestions |
| **Automation Recommendations** | Identifies which manual tests to automate with ROI estimates |
| **Generate Script** | Generates scripts for 15+ frameworks (Playwright, Selenium, Cypress, REST Assured, Postman…) |
| **Test Data Generator** | Creates valid/invalid/boundary/injection test data sets |
| **Automation Pipeline** | Converts test cases to production-ready Playwright + Cucumber BDD + TypeScript POM |
| **Security Scanner** | Scans test assets for PII exposure, secret leakage, and OWASP risks |

All agents support **multi-turn conversation memory** — pass a `session_id` to maintain context across calls.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15.3, React 19, TypeScript, TanStack Query, Framer Motion, Zustand, cmdk, Sonner |
| Backend | FastAPI 0.115, Python 3.9+, SQLModel, SQLite (dev) / PostgreSQL (prod) |
| Task Queue | Celery + Redis — async ingestion, connector sync, agent runs, webhook delivery |
| LLM Router | Groq (primary) + 5-provider fallback (Mistral, Cohere, OpenAI, Gemini, Anthropic) |
| Embeddings | Mistral 1024-dim |
| Vector DB | Pinecone (serverless), BM25 hybrid reranker (Cohere) |
| Knowledge Graph | Neo4j Aura — 193 nodes (APIEndpoints, Modules, Stories, Requirements, TestCases, Bugs) |
| Connectors | Jira, Confluence, TestRail, Zephyr, GitHub, GitLab (6 types, live sync via Celery) |
| Secret Management | HashiCorp Vault (KV v2) — with env-var fallback for dev |
| Auth | JWT (1h access + 30d refresh) · ABAC role+team enforcement · SAML 2.0 SSO (python3-saml) |
| Parsers | PDF, XLSX, CSV, DOCX, HTML, MD, JSON, YAML, TS/JS/PY, JUnit XML, Playwright JSON |
| Deployment | Docker Compose · Render (backend + Redis + Celery) · Vercel (frontend) · render-staging.yaml |
| VS Code | Extension at `vscode-extension/` — right-click migrate, webview panel |

---

## Quick Start (Local)

### Prerequisites
- Python 3.9+
- Node.js 18+
- Redis (for task queue — `brew install redis && redis-server`)
- API keys: Groq, Mistral, Pinecone (all have free tiers)

### 1. Clone and configure

```bash
git clone https://github.com/araushan2010143/AITesterBlueprint3x.git
cd AITesterBlueprint3x/QA_RAG_PLATFORM
cp .env.example .env
# Edit .env — minimum required: GROQ_API_KEY, MISTRAL_API_KEY, PINECONE_API_KEY
```

### 2. Backend

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000 --reload-exclude '.venv'
```

Backend docs: http://localhost:8000/api/docs

### 3. Celery worker (optional — for async sync/ingest)

```bash
# In a separate terminal
python3 -c "
from dotenv import load_dotenv; load_dotenv('.env', override=False)
import subprocess, sys
subprocess.run([sys.executable, '-m', 'celery', '-A', 'backend.celery_app:celery_app',
  'worker', '--loglevel=info', '--queues=connectors,agents,webhooks,ingest,celery', '--concurrency=2'])
"
```

Without a worker, connector syncs fall back to synchronous execution inside the API process.

### 4. Frontend

```bash
cd frontend
npm install
npm run dev -- -p 3001
```

App: http://localhost:3001

### 5. Run tests

```bash
# All tests (280+ cases)
RATE_LIMIT_DISABLED=true .venv/bin/python3 -m pytest tests/ -v

# Unit tests only (fast, no I/O)
RATE_LIMIT_DISABLED=true .venv/bin/python3 -m pytest tests/test_unit_*.py -v

# Integration tests only
RATE_LIMIT_DISABLED=true .venv/bin/python3 -m pytest tests/test_integration_*.py -v

# Single test module
RATE_LIMIT_DISABLED=true .venv/bin/python3 -m pytest tests/test_unit_pii_scanner.py -v
```

Set `RATE_LIMIT_DISABLED=true` to avoid IP-based rate-limit interference during test runs.

---

## Docker Compose (full stack)

```bash
cp .env.example .env   # fill in API keys
docker-compose up --build
# Backend:  http://localhost:8000
# Frontend: http://localhost:3001
```

### Staging environment

```bash
docker compose -f docker-compose.staging.yml up --build
# Backend:  http://localhost:8001  (ENVIRONMENT=staging, strict ABAC, SAML strict)
# Frontend: http://localhost:3002
# Redis:    localhost:6380
# Vault:    http://localhost:8201
```

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Primary LLM — [console.groq.com](https://console.groq.com) (free) |
| `MISTRAL_API_KEY` | Embeddings (1024-dim) — [platform.mistral.ai](https://platform.mistral.ai) |
| `PINECONE_API_KEY` | Vector store — [pinecone.io](https://pinecone.io) (free serverless) |
| `PINECONE_INDEX_NAME` | Index name (default: `qa-rag-platform`) |

### Optional — LLM fallback chain

| Variable | Description |
|---|---|
| `COHERE_API_KEY` | Reranker + LLM fallback |
| `OPENAI_API_KEY` | LLM fallback (gpt-4o-mini) |
| `GEMINI_API_KEY` | LLM fallback (gemini-1.5-flash) |

### Optional — Knowledge Graph

| Variable | Description |
|---|---|
| `NEO4J_URI` | Neo4j Aura connection URI |
| `NEO4J_USER` | Neo4j username |
| `NEO4J_PASSWORD` | Neo4j password |

### Optional — Task Queue

| Variable | Description |
|---|---|
| `REDIS_URL` | Redis connection URL (default: `redis://localhost:6379/0`) |
| `CELERY_BROKER_URL` | Celery broker (defaults to `REDIS_URL`) |
| `CELERY_RESULT_BACKEND` | Celery result backend |

### Optional — Secret Management

| Variable | Description |
|---|---|
| `VAULT_ADDR` | HashiCorp Vault address (e.g. `http://127.0.0.1:8200`) |
| `VAULT_TOKEN` | Vault auth token |
| `VAULT_MOUNT` | KV mount (default: `secret`) |
| `VAULT_PATH_PREFIX` | Path prefix (default: `qa-rag-platform`) |

### Optional — SAML SSO

| Variable | Description |
|---|---|
| `SAML_SP_ENTITY_ID` | SP Entity ID (e.g. `https://yourapp.com/api/auth/saml/metadata`) |
| `SAML_SP_CALLBACK_URL` | ACS callback URL |
| `SAML_IDP_ENTITY_ID` | IdP Entity ID |
| `SAML_IDP_SSO_URL` | IdP SSO redirect URL |
| `SAML_IDP_CERT` | IdP X.509 certificate (base64, no headers) |
| `SAML_SP_CERT` | SP certificate (optional, for signed requests) |
| `SAML_SP_KEY` | SP private key (optional) |
| `SAML_STRICT` | `true` (production) / `false` (dev) |

### Optional — Connectors

| Variable | Description |
|---|---|
| `JIRA_BASE_URL` | Jira Cloud URL (e.g. `https://yourco.atlassian.net`) |
| `JIRA_EMAIL` | Atlassian account email |
| `JIRA_TOKEN` | Atlassian API token |

---

## API Reference

### Core

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Platform info |
| `GET` | `/health` | Health check (Vault, Graph, version) |
| `GET` | `/api/docs` | Swagger UI |

### Ingestion

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/ingest/upload` | Upload + ingest a QA document |
| `GET` | `/api/documents` | List ingested documents |
| `DELETE` | `/api/documents/{id}` | Delete a document + its vectors |

### Search & RAG

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/search` | Hybrid BM25 + dense search (ABAC enforced) |
| `POST` | `/api/search/ask` | RAG Q&A with citations (ABAC enforced) |

### AI Agents

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/ai/actions` | List all 12 agents |
| `POST` | `/api/ai/{action}` | Run an agent (pass `session_id` for multi-turn) |
| `POST` | `/api/ai/parse-report` | Parse JUnit XML / Playwright JSON / text |
| `GET` | `/api/agents/runs` | List agent run history |

### Knowledge Graph

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/graph/stats` | Node + relationship counts |
| `GET` | `/api/graph/impact/{story_id}` | Impact analysis for a story |
| `POST` | `/api/graph/populate/jira` | Populate graph from Jira connector |
| `POST` | `/api/graph/populate/api-endpoints` | Populate APIEndpoint nodes |

### Connectors

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/connectors` | List connectors |
| `POST` | `/api/connectors` | Create connector |
| `PUT` | `/api/connectors/{id}` | Update connector |
| `POST` | `/api/connectors/{id}/test` | Test connection |
| `POST` | `/api/connectors/{id}/sync` | Trigger sync (async via Celery) |
| `GET` | `/api/connectors/{id}/runs` | Sync run history |

### Auth & SSO

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Email + password login → JWT |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `GET` | `/api/auth/saml/status` | SAML SSO status |
| `GET` | `/api/auth/saml/metadata` | SP metadata XML (give to IdP) |
| `GET` | `/api/auth/saml/login` | Initiate SAML SSO |
| `POST` | `/api/auth/saml/callback` | ACS endpoint — validates assertion, returns JWT |

### Prompts & Audit

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/prompts` | List versioned prompts |
| `POST` | `/api/prompts` | Create prompt version |
| `GET` | `/api/audit/logs` | Audit log with JSONL export |
| `GET` | `/api/analytics/overview` | Usage analytics |

---

## Security Model

- **ABAC**: Every `/search` and `/ask` request requires `permission(document:read)` — role + `team_id` enforced from JWT, not caller-supplied params (BUG-002 fix)
- **Multi-tenancy**: All Pinecone queries filter by `team_id` derived from JWT
- **SAML 2.0**: SP-initiated SSO via `python3-saml`; SP metadata at `/api/auth/saml/metadata`
- **Secrets**: HashiCorp Vault KV v2 with env-var fallback; `VAULT_ADDR` + token auth in dev
- **Audit log**: Every API call logged with user, action, resource, status, and risk score
- **Rate limiting**: Per-IP middleware on all routes
- **Webhook HMAC**: SHA-256 signature on all outgoing webhook payloads

---

## Project Structure

```
QA_RAG_PLATFORM/
├── backend/
│   ├── abac/                # ABAC engine + decorators (require_permission)
│   ├── agents/              # 12 AI agents + base_agent.py (multi-turn memory)
│   │   └── schemas.py       # AgentTask with session_id + conversation_history
│   ├── api/routes/          # FastAPI routes
│   │   ├── ingest.py        # Document upload + PII scan
│   │   ├── search.py        # /search + /ask (ABAC enforced)
│   │   ├── connectors.py    # CRUD + sync trigger
│   │   ├── graph.py         # Knowledge Graph endpoints
│   │   ├── agents.py        # Agent run endpoints
│   │   ├── saml.py          # SAML 2.0 SSO (SP side)
│   │   ├── auth.py          # JWT login/refresh
│   │   ├── prompts.py       # Versioned prompt CRUD
│   │   ├── audit.py         # Audit log
│   │   ├── webhooks.py      # Webhook delivery
│   │   └── analytics.py     # Usage analytics
│   ├── celery_app.py        # Celery app + dispatch helper
│   ├── config.py            # Pydantic Settings
│   ├── database/db.py       # SQLModel tables incl. AgentSession
│   ├── embeddings/          # Mistral embedding client
│   ├── graph/               # Neo4j client + impact analyzer + graph builder
│   ├── llm/                 # 6-provider LLM router
│   ├── middleware/          # Auth · rate limit · audit log
│   ├── models/              # SQLModel models (connector, user, team, agent_run…)
│   ├── parsers/             # Multi-format parsers
│   ├── retrieval/           # Hybrid search (BM25 + Pinecone + Cohere reranker)
│   ├── services/
│   │   ├── jira_connector.py    # Jira API v3 client (/search/jql)
│   │   ├── saml_service.py      # python3-saml wrapper
│   │   └── vault_service.py     # HashiCorp Vault hvac client
│   ├── tasks/               # Celery tasks
│   │   ├── connector_tasks.py   # sync_connector_task, populate_graph_task
│   │   ├── agent_tasks.py       # run_agent_task
│   │   └── webhook_tasks.py     # deliver_webhook_task
│   ├── vectorstore/         # Pinecone client
│   └── main.py              # FastAPI app (load_dotenv at top)
├── frontend/src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── page.tsx         # Dashboard
│   │   ├── ai/              # AI Agents
│   │   ├── upload/          # Document ingestion
│   │   ├── search/          # RAG search
│   │   ├── documents/       # Document library
│   │   ├── graph/           # Knowledge Graph explorer
│   │   ├── connectors/      # Connector management
│   │   ├── agents/          # Agent run history
│   │   ├── prompts/         # Prompt version manager
│   │   ├── audit/           # Audit log viewer
│   │   └── analytics/       # Usage analytics
│   ├── components/          # Sidebar, CommandPalette, shared UI
│   └── lib/                 # api.ts, store.ts, export.ts
├── tests/
│   ├── conftest.py                      # Shared fixtures (JUnit XML, Playwright JSON, mock LLM)
│   ├── test_unit_chunker.py             # Chunking strategies (recursive/semantic/fixed)
│   ├── test_unit_pii_scanner.py         # PII + secret detection and redaction
│   ├── test_unit_abac.py                # ABAC engine (roles, conditions, wildcards)
│   ├── test_unit_llm_router.py          # LLM router fallback, muting, token capping
│   ├── test_flaky_scoring.py            # Flaky score deterministic functions
│   ├── test_parsers.py                  # JUnit XML + Playwright JSON parsers
│   ├── test_api.py                      # AI agent + parse-report integration
│   ├── test_integration_auth.py         # Register, login, refresh, logout, sessions
│   ├── test_integration_middleware.py   # API key auth + rate limit middleware
│   ├── test_integration_documents.py    # Documents list/get/upload/delete
│   └── test_integration_health.py      # Health, root, stats, LLM status, OpenAPI
├── vscode-extension/        # VS Code extension (right-click migrate)
├── k8s/                     # Kubernetes manifests
├── sample_data/             # Sample JUnit XML + Playwright JSON reports
├── docker-compose.yml       # Development
├── docker-compose.staging.yml  # Staging (Redis + Vault + Celery)
├── render.yaml              # Production on Render
├── render-staging.yaml      # Staging on Render (Blueprint)
└── .env.example
```

---

## Knowledge Graph

The platform builds a live Knowledge Graph in Neo4j Aura:

```
193 nodes:
  APIEndpoint (128) — every backend route, classified by module
  Module      (14)  — functional areas (auth, ingest, search, agents…)
  Story        (N)  — Jira stories from live connector sync
  Requirement  (N)  — linked to stories and test cases
  TestCase     (N)  — coverage mapping
  Bug          (N)  — defects with FIXED_IN release links
  Release      (N)  — release readiness nodes

190 relationships:
  BELONGS_TO   — APIEndpoint → Module
  IMPLEMENTS   — Story → Requirement
  COVERS       — TestCase → Requirement
  TARGETS      — Bug → Story
  FIXED_IN     — Bug → Release
  FOUND_IN     — Bug → Module
```

**Impact analysis**: `GET /api/graph/impact/{story_id}` returns affected test cases, linked bugs, risk score, and coverage percentage — used by AI agents to enrich their context.

---

## Flaky Test Analyzer

Upload JUnit XML or Playwright JSON from multiple builds and get:

- **10-class failure classification** (Product Bug / Automation Bug / Timing / Test Data / Infrastructure / Environment / Network / State Leakage / Flaky / Unknown)
- **Flaky score** (Python-computed, never LLM arithmetic): `round((1 - pass_rate) × 100)`
- **Action**: Fix Now (80+) / Quarantine (50-79) / Monitor (20-49) / Stable (0-19)
- **Before/after code fixes** per test
- **RAG memory** — past analyses indexed in Pinecone; similar failures surface historical context

```bash
# Sample data included
sample_data/build1_results.json   # 7 pass / 3 fail
sample_data/build2_results.json   # 4 pass / 6 fail
```

---

## Jira Connector — Live Sync

```bash
# 1. Create connector via API
curl -X POST /api/connectors \
  -d '{"connector_type":"jira","base_url":"https://yourco.atlassian.net",
       "email":"you@co.com","api_token":"ATATT...","project_keys":"KAN,PROJ"}'

# 2. Test connection
curl -X POST /api/connectors/{id}/test

# 3. Trigger sync (Celery async)
curl -X POST /api/connectors/{id}/sync
# Returns: {"run_id": "...", "status": "started", "queue": "celery"}

# 4. Poll for result
curl /api/connectors/runs/{run_id}
# {"status": "done", "items_fetched": 21, "items_ingested": 21}
```

Synced issues are embedded into Pinecone and linked into Neo4j — making Jira tickets queryable via `/ask`.

---

## Production Deployment

### Render + Vercel (recommended)

**Backend (render.yaml included)**
1. Push to GitHub
2. New → Web Service → connect repo
3. Root directory: `QA_RAG_PLATFORM`
4. Build: `pip install -r backend/requirements.txt`
5. Start: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
6. Set env vars (see Environment Variables above)

**Staging (render-staging.yaml)**
- Same Blueprint pattern, `render-staging.yaml` includes Redis service + Celery worker
- `ENVIRONMENT=staging`, Pinecone namespace isolated to `staging`

**Frontend on Vercel**
1. Root directory: `QA_RAG_PLATFORM/frontend`
2. Install: `npm install --legacy-peer-deps`
3. Set `NEXT_PUBLIC_API_URL=https://your-render-app.onrender.com`

**24/7 uptime on free tier**
- `.github/workflows/keep-alive.yml` — pings `/health` every 10 minutes
- UptimeRobot — external monitor every 5 minutes

### Docker Compose

```bash
# Development
docker-compose up --build

# Staging (Redis + Vault + Celery worker included)
docker-compose -f docker-compose.staging.yml up --build
```

---

## License

MIT
