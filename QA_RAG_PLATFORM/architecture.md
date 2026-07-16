# Architecture — QA RAG Platform v6.0.0

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     BROWSER  (Next.js 15.3 + React 19)                      │
│                                                                             │
│  ┌──────────────────┐  ┌───────────────────────────────────────────────┐   │
│  │  Enterprise      │  │  Pages                                        │   │
│  │  Sidebar         │  │  Dashboard · AI Agents · Documents · Search   │   │
│  │  (Framer Motion) │  │  Graph · Connectors · Prompts · Audit · SAML  │   │
│  │  240px ↔ 64px   │  │                                               │   │
│  │  Zustand persist │  │  ⌘K CommandPalette (cmdk + blur backdrop)    │   │
│  │  LLM status dots │  │  Sonner toasts (bottom-right)                │   │
│  └──────────────────┘  │  TanStack Query (stale-while-revalidate)     │   │
│                         │  Axios interceptors: JWT attach + 401 refresh│   │
│                         └───────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ HTTPS /api/* (Next.js rewrites proxy)
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend  (Python 3.9+)  :8000                     │
│                                                                             │
│  Middleware stack (outermost → innermost):                                  │
│    APIKeyMiddleware → RateLimitMiddleware → AuditLogMiddleware               │
│                                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │  /ingest     │ │  /search     │ │  /ai/{action}│ │  /connectors     │  │
│  │  upload+PII  │ │  /ask        │ │  12 agents   │ │  /graph          │  │
│  │  → Celery    │ │  ABAC guard  │ │  session_id  │ │  /auth/saml      │  │
│  │    ingest    │ │  JWT team_id │ │  history     │ │  /prompts /audit │  │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────────┘  │
│         └────────────────┴────────────────┴────────────────┘               │
│                                    │                                        │
│  ┌─────────────────────────────────▼──────────────────────────────────┐    │
│  │                         Core Services                              │    │
│  │                                                                    │    │
│  │  hybrid_search.py     — BM25 + Pinecone dense + Cohere reranker   │    │
│  │  jira_connector.py    — Jira API v3 (/search/jql)                 │    │
│  │  saml_service.py      — python3-saml SP-initiated SSO             │    │
│  │  vault_service.py     — hvac KV v2 client, env-var fallback       │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        LLM Router  (6 providers)                    │   │
│  │                                                                     │   │
│  │  Primary:  Groq llama-3.3-70b-versatile                            │   │
│  │  Fallback: Groq llama-3.1-8b-instant → Mistral mistral-small →    │   │
│  │            Cohere command-r-plus → OpenAI gpt-4o-mini →            │   │
│  │            Gemini gemini-1.5-flash                                 │   │
│  │                                                                     │   │
│  │  Auto-retry on 429/503 · token budget · JSON mode                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└──────┬───────────────────────┬───────────────────────┬──────────────────────┘
       │                       │                       │
       ▼                       ▼                       ▼
┌─────────────┐   ┌────────────────────┐   ┌────────────────────────┐
│   Redis     │   │  Celery Workers    │   │  HashiCorp Vault       │
│  :6379      │   │  (2+ concurrent)   │   │  KV v2  :8200          │
│             │   │                    │   │                        │
│  Broker +   │◄──│  queues:           │   │  secret/qa-rag-*/      │
│  Result     │   │  connectors        │   │   pinecone api_key     │
│  backend    │   │  agents            │   │   groq    api_key      │
│             │   │  webhooks          │   │   mistral api_key      │
│  Rate limit │   │  ingest            │   │   neo4j   password     │
│  cache      │   │  celery (default)  │   │   redis   url          │
└─────────────┘   └────────────────────┘   └────────────────────────┘
       │
       │                ┌──────────────────────────────────────────────────┐
       │                │              Data Layer                          │
       │                │                                                  │
       │                │  ┌──────────────────┐  ┌──────────────────────┐ │
       │                │  │  Pinecone        │  │  SQLite / PostgreSQL │ │
       │                │  │  (Serverless)    │  │                      │ │
       └───────────────►│  │                  │  │  documents           │ │
                        │  │  1024-dim Mistral│  │  chunks              │ │
                        │  │  cosine sim      │  │  agent_runs          │ │
                        │  │  team_id filter  │  │  agent_sessions      │ │
                        │  │  namespace:      │  │  connectors          │ │
                        │  │    default       │  │  connector_runs      │ │
                        │  │    staging       │  │  prompt_versions     │ │
                        │  └──────────────────┘  │  audit_logs          │ │
                        │                         │  webhooks            │ │
                        │  ┌──────────────────┐  │  users / teams       │ │
                        │  │  Neo4j Aura      │  │  refresh_tokens      │ │
                        │  │  Knowledge Graph │  └──────────────────────┘ │
                        │  │                  │                            │
                        │  │  193 nodes       │                            │
                        │  │  190 rels        │                            │
                        │  │  128 APIEndpoint │                            │
                        │  │   14 Module      │                            │
                        │  │   51 domain nodes│                            │
                        │  └──────────────────┘                            │
                        └──────────────────────────────────────────────────┘
```

---

## Security Architecture

```
Request
  │
  ▼
APIKeyMiddleware
  ├── If API_KEY not set → dev mode (bypass, warn)
  ├── Header X-API-Key matches → set request.state.user
  └── Authorization: Bearer <jwt>
        └── decode JWT → {sub, email, role, team_id, exp}

  ▼
RateLimitMiddleware (per-IP sliding window)

  ▼
AuditLogMiddleware (records after response, captures status + user)

  ▼
Route handler
  └── Depends(require_permission(RESOURCE_DOCUMENT, ACTION_READ))
        ├── Checks role ∈ {admin, user}  (viewer → 403)
        ├── team_id from JWT (never from query param — BUG-002)
        └── Returns user dict for downstream use

  ▼
Pinecone query
  └── filter = {"team_id": {"$eq": user["team_id"]}}
      (enforced server-side, not trust-but-verify)
```

### SAML 2.0 Flow

```
Browser → GET /api/auth/saml/login
            │
            └── saml_service.get_login_url()
                  → python3-saml builds AuthnRequest
                  → 302 redirect to IdP SSO URL (samltest.id / Okta / Azure AD)

IdP authenticates user
            │
            └── POST /api/auth/saml/callback
                  SAMLResponse (base64 encoded XML)
                  │
                  └── saml_service.process_response()
                        → validate signature + conditions
                        → extract email, display_name, groups
                        → provision_user() → upsert in SQLite
                        → _create_token() → JWT (24h)
                  └── return {"access_token": "...", "user": {...}}
```

---

## Celery Task Architecture

```
API Request
  │
  └── dispatch(task_fn, run_id, connector_id)
        │
        ├── Redis available? → task_fn.delay(run_id, connector_id)  [async]
        │     └── Worker pool picks up task from "connectors" queue
        │           └── _run_sync(run_id, connector_id)
        │                 ├── fetch issues via jira_connector.iter_issues()
        │                 ├── embed text → Pinecone upsert
        │                 ├── update ConnectorRun (items_fetched, status, completed_at)
        │                 └── update DataConnector.last_sync_status
        │
        └── Redis unavailable? → task_fn(run_id, connector_id)  [sync fallback]
              (runs in the API process, blocks the response)

Queues:
  connectors  — sync_connector_task, populate_graph_task
  agents      — run_agent_task
  webhooks    — deliver_webhook_task
  ingest      — document_ingest_task
  celery      — default catchall
```

---

## Agent Multi-Turn Memory

```
POST /api/ai/{action}
  body: { query: "...", session_id: "abc-123", team_id: "demo-team" }
          │
          ▼
BaseAgent.run(task)
  │
  ├── _load_session_history("abc-123")
  │     └── SELECT messages FROM agent_sessions WHERE session_id = "abc-123"
  │           → JSON array of {"role": "user"|"assistant", "content": "..."}
  │
  ├── _gather_rag_context(task)   → Pinecone hybrid search
  ├── _gather_graph_context(task) → Neo4j impact traversal
  │
  ├── call_llm(system_prompt, user_msg, history=history[-20:])
  │     messages = [system] + history[-20:] + [user]
  │     → Groq API → response text
  │
  └── _save_session_history("abc-123", user_msg, response, team_id)
        → UPSERT agent_sessions (append turn, UPDATE updated_at)

Session cap: last 20 messages (10 turns) to stay within context window
Storage: SQLite agent_sessions table (persistent across restarts)
```

---

## Knowledge Graph Architecture

```
Ingest pipeline
  │
  ├── POST /api/ingest/upload
  │     → embed chunks → Pinecone
  │     → store metadata → SQLite documents table
  │
  └── POST /api/graph/populate/jira  (or connector sync)
        → JiraClient.iter_issues(project_keys)
        → GraphBuilder.upsert_story()
        → GraphBuilder.upsert_requirement()
        → GraphBuilder.upsert_test_case()
        → GraphBuilder.upsert_bug()
        → GraphBuilder.create_relationship()

POST /api/graph/populate/api-endpoints
  → inspect FastAPI app.routes
  → GraphBuilder.upsert_api_endpoint(path, method, module)
  → 128 APIEndpoint nodes, path-prefix → module classification

GET /api/graph/impact/{story_id}
  → neo4j_client.run_query(MATCH (s:Story {id: $id})-[*1..3]-(n) RETURN n)
  → returns: affected_test_cases, linked_bugs, risk_score, coverage_pct
  → consumed by RCA agent + Release Summary agent
```

Node labels and their key properties:

| Label | Key Properties |
|---|---|
| `APIEndpoint` | `path`, `method`, `module_name`, `team_id` |
| `Module` | `name`, `description` |
| `Story` | `id`, `summary`, `status`, `priority` |
| `Requirement` | `id`, `title`, `module` |
| `TestCase` | `id`, `title`, `status`, `automation_status` |
| `Bug` | `id`, `summary`, `severity`, `status` |
| `Release` | `version`, `status`, `date` |

---

## RAG Pipeline

```
POST /api/search/ask  { query: "What is our STLC process?", team_id: (from JWT) }
           │
           ▼
hybrid_search.search(query_text, top_k=10, pinecone_filter={"team_id": ...})
  │
  ├── BM25 retrieval (TF-IDF over stored chunks)
  │     └── top-k BM25 hits
  │
  ├── Dense retrieval
  │     ├── MistralEmbeddingClient.embed(query)  → 1024-dim vector
  │     └── PineconeClient.query(vector, filter)  → top-k cosine hits
  │
  └── Cohere reranker (if COHERE_API_KEY set)
        └── rerank(query, bm25_hits + dense_hits, top_n=5)

           ▼
LLM call  (Groq llama-3.3-70b)
  prompt = system_prompt + "\n\nContext:\n" + "\n---\n".join(chunks) + "\n\nQ: " + query
           │
           ▼
Response with citations (chunk_id, filename, score, excerpt)
```

Retrieval confidence: best observed 0.97 on 8-document corpus (STLC, API testing, test strategy, automation, defect management, performance, mobile/a11y, Playwright).

---

## Prompt Versioning

```
POST /api/prompts
  { name: "rag_system_v3", content: "You are...", tags: ["rag","v3"] }
           │
           └── PromptVersion(id=uuid, name, content, hash=sha256, created_at)
                 stored in SQLite prompt_versions table
                 immutable — no UPDATE/DELETE allowed after creation

GET /api/prompts/{name}/diff?v1=1&v2=2
  → unified diff of content fields

Agents reference prompt by name + version; pinning prevents silent regressions.
```

---

## Data Flow — Jira Sync

```
POST /api/connectors/{id}/sync
  │
  ├── Create ConnectorRun(status="running") in SQLite
  ├── dispatch(sync_connector_task, run_id, connector_id)  → Redis queue
  └── Return {"run_id": "...", "status": "started", "queue": "celery"}

Celery worker:
  sync_connector_task(self, run_id, connector_id)
    → _run_sync(run_id, connector_id)
          │
          ├── Decode api_token from base64
          ├── JiraClient(base_url, email, api_token)
          ├── JiraClient.iter_issues(project_keys)
          │     GET /rest/api/3/search/jql
          │       jql = "project in (KAN, SAM1) ORDER BY updated DESC"
          │       paginated, 50 issues/page
          │
          ├── For each issue:
          │     text = f"{issue.key}: {issue.summary}\n{issue.description}"
          │     embed(text) → Pinecone upsert(metadata={team_id, doc_type:"jira"})
          │
          └── Update ConnectorRun:
                status="done", items_fetched=N, items_ingested=N, completed_at=now
                Update DataConnector: last_sync_status="done", last_sync_at=now

GET /api/connectors/runs/{run_id}
  → live status polling (status: "running" → "done"|"failed")
```

---

## Staging vs Production

| Concern | Dev | Staging | Production |
|---|---|---|---|
| ENVIRONMENT | (not set) | `staging` | `production` |
| ABAC bypass | yes (no API_KEY) | no | no |
| Pinecone namespace | default | `staging` | default |
| SAML strict | false | true | true |
| Vault | dev server (-dev) | dev server | persistent cluster |
| Redis | local :6379 | container :6379 | Render managed |
| DB | SQLite | SQLite (volume) | PostgreSQL |
| Compose file | `docker-compose.yml` | `docker-compose.staging.yml` | `render.yaml` |
| Render Blueprint | — | `render-staging.yaml` | `render.yaml` |

---

## Deployment — Render Blueprint

```yaml
# render-staging.yaml registers 4 services in one Blueprint:
#
#   qa-rag-platform-api-staging    (web, starter plan)
#   qa-rag-platform-celery-staging (worker, starter plan)
#   qa-rag-platform-redis-staging  (redis, free plan)
#   qa-rag-platform-frontend-staging (web, starter plan)
#
# fromService bindings wire Redis connection string automatically.
# autoDeploy: false — promotion from branch is manual.
```

---

## Test Architecture

```
tests/
├── conftest.py              — fixtures (JUnit XML, Playwright JSON, mock LLM)
├── test_api.py              — integration tests (FastAPI TestClient)
│   ├── TestListActions      — GET /api/ai/actions
│   ├── TestParseReport      — POST /api/ai/parse-report
│   ├── TestFlakyAnalyzer    — full pipeline (LLM mocked)
│   └── TestHealth           — GET /health
├── test_flaky_scoring.py    — unit tests (pure Python)
│   ├── TestScoreFromHistory
│   ├── TestActionFromScore
│   └── TestEnrichTest
└── test_parsers.py          — unit tests
    ├── TestJUnitXMLParser
    ├── TestPlaywrightJSONParser
    └── TestNormalizer
```

Run: `.venv/bin/python3 -m pytest tests/ -v`

---

## Key Design Decisions

### 1. Python computes scores — LLM never does arithmetic
`flaky_score` and `action` are computed deterministically in Python from `run_history` arrays. The LLM returns only raw pass/fail strings; Python applies `round((1 - passes/total) * 100)`.

### 2. Module-level `os.getenv()` is dangerous
Any service that calls `os.getenv()` at module import time gets an empty string unless `load_dotenv()` has already run. Pattern fix: always call inside functions, or use `get_settings()`. Applied to `vault_service.py` and `neo4j_client.py`. `load_dotenv()` runs at the top of `backend/main.py` before all other imports.

### 3. Celery task registration requires explicit import
`celery_app.autodiscover_tasks()` is unreliable when tasks use a custom `_task` decorator wrapper. Tasks are explicitly imported via `importlib.import_module()` at `celery_app` creation time, ensuring the worker process registers all task names before accepting messages.

### 4. JWT-derived `team_id` — not caller-supplied (BUG-002)
The previous `/ask` endpoint accepted `team_id` as a query parameter, allowing any authenticated user to query another team's documents. Fixed by deriving `team_id` exclusively from the JWT payload in `require_permission()`.

### 5. Two-stage agent pipeline
Stage 1 (classify) and Stage 2 (fix) use separate LLM calls. Python enriches the Stage 1 output (scores, actions) before Stage 2 runs, giving better quality than a monolithic prompt and keeping arithmetic out of the LLM.

### 6. Vault env-var fallback
`vault_service.get_secret(component, key, default="")` always falls back to `os.getenv(key.upper(), default)` when Vault is disabled or the key is absent. No caller needs to know whether secrets come from Vault or `.env`.

### 7. Non-blocking RAG indexing
After flaky analysis, failures are indexed into Pinecone in a background thread. The HTTP response returns immediately; future analyses receive historical context from past runs.
