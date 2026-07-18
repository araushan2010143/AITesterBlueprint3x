# QA Intelligence Platform — Architecture v1.0

> **Design principle:** Chat is one interface. The Knowledge Layer is the product.
> Every future feature (RCA, RTM, Coverage Analysis, Flaky Tests) reuses the same
> retrieval engine, graph traversal, and agent framework.

---

## System Overview

```
                        QA Intelligence Platform
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
          Chat UI          Search UI           RCA UI
          (Next.js)        (Next.js)          (Next.js)
              │                 │                  │
              └─────────────────┼──────────────────┘
                                │
                      FastAPI Gateway :8000
                                │
                ┌───────────────┼───────────────┐
                │               │               │
         Retrieval Engine   Agent Engine    Auth / ABAC
                │               │
                └───────┬───────┘
                        │
                  Knowledge Layer
                        │
           ┌────────────┼────────────┐
           │                         │
    Hybrid Search           Structured Search
    (Vector + BM25)          (Metadata Filters)
           │                         │
        Qdrant               SQLite / Postgres
     (collections)
           │
       Embeddings
    (BAAI/bge-m3)
           │
    Document Pipeline
           │
  ┌────────┴────────┐
  │  Code (Java/TS) │
  │  PDF / Word     │
  │  CSV / Excel    │
  │  JIRA           │
  │  Markdown/PRD   │
  │  Logs           │
  │  Meeting Notes  │
  └─────────────────┘
```

---

## Layer Descriptions

### 1. Frontend (Next.js 15 App Router)

| Route | Purpose |
|---|---|
| `/` | Dashboard — ingestion status, collection stats |
| `/chat` | QA Assistant chat with citations |
| `/search` | Structured search with metadata filters |
| `/rca` | Root Cause Analysis workflow |
| `/rtm` | Requirements Traceability Matrix |
| `/coverage` | Test coverage gaps |
| `/agents` | Agent playground |

### 2. FastAPI Gateway

- `POST /api/chat` — chat with QA Assistant
- `POST /api/search` — structured hybrid search
- `POST /api/ingest` — ingest a document / repo
- `GET  /api/collections` — collection stats
- `POST /api/agents/{agent_id}/run` — run a specialized agent
- `GET  /api/health` — health check
- `GET  /api/rca` — RCA for a bug/log/commit

### 3. Knowledge Layer (Central — `backend/knowledge/`)

The heart of the platform. Never call Qdrant or the LLM directly from routes.
Always go through the Knowledge Layer.

```
RetrievalEngine
    ├── IntentClassifier   — routes query to correct collection(s)
    ├── QueryExpander      — expands abbreviations, synonyms
    ├── HybridSearcher     — Qdrant dense + BM25 sparse fusion
    ├── MetadataFilter     — applies sprint/severity/module filters
    ├── Reranker           — bge-reranker-large cross-encoder
    ├── ContextCompressor  — trims to LLM token budget
    └── CitationValidator  — verifies sources, builds citation list
```

### 4. Document Pipeline (`backend/pipeline/`)

```
Source → Parser → Chunker → Metadata Enricher → Embedder → Qdrant Upsert
                                                              (SHA256 incremental)
```

**Source-specific chunking:**

| Source | Chunk unit |
|---|---|
| Java / TypeScript / Python | Function or class (AST-based) |
| PDF / Word | 400–600 tokens, heading-aware |
| Meeting notes | Speaker turn block |
| Log files | 100–150 lines |
| CSV | One row = one chunk |
| Excel (test cases) | One row = one test case |
| JIRA | One issue = one chunk |
| Markdown / PRD | Heading-based sections |

### 5. Collections (`backend/collections/`)

Each Qdrant collection has its own vector space and metadata schema.
Intent routing directs queries to one or more collections.

```
selenium        playwright      jira
testcases       prd             logs
meeting_notes   lucid           company_docs
jenkins
```

### 6. Knowledge Graph (`backend/graph/`)

Neo4j Aura for relationship-aware traversal.

```
TestCase ──COVERS──> UserStory ──IMPLEMENTS──> PRDSection
    │                    │
AUTOMATES            LINKED_TO
    │                    │
AutoScript           JIRAIssue ──FIXED_BY──> Commit
    │                                           │
EXECUTED_IN                               INTRODUCED_BY
    │                                           │
TestRun ──FOUND──> Bug ──REOPENED_BY──> Regression
```

Enables GraphRAG queries like:
- "Which requirements have no test cases?"
- "Which bugs have no automation?"
- "Which commits introduced flaky tests?"
- "Show full traceability for TC-456"

### 7. Agent Engine (`backend/agents/`)

All agents share the same Knowledge Layer. No agent queries Qdrant directly.

| Agent | Capability |
|---|---|
| `QAAssistant` | General QA knowledge, framework help, best practices |
| `RCAAgent` | Root cause from logs + commits + history + PRD |
| `FlakyTestAgent` | Flaky score, retry pattern, locator stability analysis |
| `RTMBuilder` | Requirements → Stories → TestCases traceability |
| `CoverageAnalyzer` | Gap analysis: requirements with no test coverage |
| `AutomationCoach` | Migration guidance Selenium/RobotFramework → Playwright |
| `ReleaseReadinessAgent` | Risk from test gaps, open bugs, coverage |

### 8. LLM Router (`backend/llm/`)

Multi-provider with fallback and muting:
- Primary: Groq (speed)
- Fallback chain: OpenAI → Mistral → Anthropic → Cohere → Gemini
- Quota/rate errors → mute provider for cooldown period
- Auth errors → propagate immediately

---

## Retrieval Pipeline (Full Detail)

```
User Query
    │
    ▼
IntentClassifier
    │  classify → [framework|bug|testcase|code|review|general]
    │
    ▼
QueryExpander
    │  "TC-456 login" → "test case TC-456 login authentication"
    │
    ▼
HybridSearcher
    │  Qdrant dense (bge-m3) + BM25 sparse → RRF fusion
    │  Collections: determined by intent
    │
    ▼
MetadataFilter
    │  sprint=17, severity=High, framework=playwright, module=login
    │
    ▼
Reranker (bge-reranker-large)
    │  cross-encoder scores all candidates, top-k selected
    │
    ▼
ContextCompressor
    │  trim to 6000 token budget
    │
    ▼
LLM (via LLMRouter)
    │
    ▼
CitationValidator
    │  verify each source exists, build citation objects
    │
    ▼
Answer + Citations
    [{ source: "PlaywrightRepo/pages/LoginPage.ts", line: 102 },
     { source: "PRD/Login.pdf", page: 17 },
     { source: "JIRA-321" }]
```

---

## Metadata Schema (every chunk)

```json
{
  "source":      "playwright",
  "repo":        "qa-automation-suite",
  "framework":   "playwright",
  "language":    "typescript",
  "filename":    "LoginPage.ts",
  "path":        "pages/LoginPage.ts",
  "function":    "switchMediaType",
  "jira":        "JIRA-321",
  "testcase":    "TC-456",
  "module":      "login",
  "feature":     "authentication",
  "component":   "LoginPage",
  "priority":    "high",
  "severity":    "critical",
  "owner":       "alice@company.com",
  "sprint":      "Sprint-17",
  "branch":      "main",
  "commit":      "43ab7f2",
  "created":     "2026-01-15T10:00:00Z",
  "updated":     "2026-07-01T14:30:00Z",
  "sha256":      "e3b0c44298fc1c149afb..."
}
```

---

## Incremental Indexing

```
Document arrives
    ↓
Compute SHA256 of content
    ↓
Look up SHA256 in index_registry table
    ↓
Changed? → Re-parse → Re-chunk → Re-embed → Upsert Qdrant
Not changed? → Skip (save compute + cost)
    ↓
Update index_registry
```

---

## Deployment (Phase 1 — Staging)

```
docker-compose.yml
├── qdrant      :6333 (vector DB)
├── api         :8000 (FastAPI)
├── frontend    :3000 (Next.js)
└── redis       :6379 (cache + job queue)
```

Phase 2: Kubernetes on DigitalOcean / GCP / AWS.

---

## Phase Roadmap

| Phase | Scope |
|---|---|
| **Phase 1** | Document pipeline, Qdrant multi-collection, hybrid retrieval, chat UI, basic agents |
| **Phase 2** | GraphRAG (Neo4j), RTM Builder, Coverage Analyzer, Git/JIRA webhooks for incremental indexing |
| **Phase 3** | RAGAS/DeepEval evaluation pipeline, self-healing automation, multi-agent orchestration |
