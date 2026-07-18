# QA Intelligence Platform — CLAUDE.md

## What this project is

A **QA Knowledge Platform** whose first capability is chat. Not a RAG chatbot — every module
(Knowledge Graph, Retrieval Engine, Indexing Pipeline, Reasoning Layer) is reusable by future
capabilities: RCA, RTM generation, flaky-test analytics, AI agents.

## Architecture principle

> Chat is one interface. The Knowledge Layer is the product.

```
Frontend (Next.js 15)
      │
FastAPI Gateway  ←  Auth / API-Key middleware
      │
┌─────┴──────┐
│  Knowledge │  ← central, reused by every feature
│   Layer    │
└─────┬──────┘
      │
  Retrieval Engine        Agent Engine
  (Hybrid: Vector + BM25  (QA Assistant, RCA Agent,
   + Reranker)             Flaky Agent, RTM Builder…)
      │
  Qdrant (multi-collection) + SQLite/Postgres (metadata)
      │
  BAAI/bge-m3 Embeddings + bge-reranker-large
      │
  Document Pipeline (code, PDF, JIRA, Excel, CSV, logs…)
```

## Key decisions (do not change without discussion)

| Decision | Choice | Reason |
|---|---|---|
| Vector DB | Qdrant | Production-ready, metadata filtering, hybrid search, snapshots |
| Embeddings | BAAI/bge-m3 | Dense + sparse + multi-vector; code + docs |
| Reranker | BAAI/bge-reranker-large | Biggest quality lift, especially for code queries |
| Retrieval | Hybrid (vector + BM25 + metadata filter + rerank) | Far more accurate than vector-only |
| Collections | One per source type | Faster retrieval, separate metadata schemas |
| Chunking | Source-specific semantic | Function/class for code; speaker-block for meetings; row for CSV |
| Graph | Neo4j Aura | Relationship traversal: TestCase→JIRA→PRD→Commit→Bug |
| Frontend | Next.js 15 App Router | Consistent with QA_RAG_PLATFORM |
| Backend | FastAPI 0.115 | Async, OpenAPI, consistent with QA_RAG_PLATFORM |

## Collections

| Collection | Chunk unit | Key metadata |
|---|---|---|
| `selenium` | Function / class | repo, framework, language, path |
| `playwright` | Function / class | repo, framework, language, path |
| `jira` | One issue | project, issue_type, sprint, severity, owner |
| `testcases` | One test case | module, feature, priority, automation_status |
| `prd` | Section (heading-based) | doc_title, section, version |
| `logs` | 100–150 lines | service, env, date, severity |
| `meeting_notes` | Speaker block | meeting_date, participants, topic |
| `lucid` | Diagram element | diagram_id, element_type |
| `company_docs` | 400–600 tokens | department, doc_type |
| `jenkins` | Build record | job, build_no, result, branch |

## Retrieval pipeline (never simplify this)

```
User Query
    ↓
Intent Detection (classify: framework / bug / testcase / code / review)
    ↓
Query Expansion (synonyms, abbreviation expansion)
    ↓
Hybrid Search (Qdrant dense + BM25 sparse)
    ↓
Metadata Filter (sprint, severity, framework, module…)
    ↓
Cross-Encoder Reranking (bge-reranker-large)
    ↓
Context Compression (trim to token budget)
    ↓
LLM (answer generation)
    ↓
Citation Validation (source, file, line / page / issue)
    ↓
Answer + Citations
```

## Agents (share the same Knowledge Layer)

- `QAAssistant` — general QA knowledge
- `RCAAgent` — root cause from logs + commits + history
- `FlakyTestAgent` — flaky score, retry pattern, locator stability
- `RTMBuilder` — Requirements → Test Case traceability matrix
- `CoverageAnalyzer` — which requirements have no tests?
- `AutomationCoach` — migration help Selenium → Playwright
- `ReleaseReadinessAgent` — release risk from test gaps + open bugs

## Dev patterns

- All `os.getenv()` calls inside functions or `get_settings()`, never at module level
- `load_dotenv()` at top of `backend/main.py` before all imports
- Every Qdrant upsert stores `sha256` of content for incremental indexing
- Every answer must return `citations` list (source, path/url, line/page)
- `RATE_LIMIT_DISABLED=true` when running tests
- Patch module-level imports in tests: `backend.api.routes.X.func_name`

## Running locally

```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev

# Qdrant (Docker)
docker compose up qdrant -d
```

## Running tests

```bash
RATE_LIMIT_DISABLED=true python -m pytest tests/ -q
```
