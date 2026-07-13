# QA RAG Platform

> Enterprise QA Knowledge & AI Intelligence Platform — multi-format RAG pipeline + 11 specialized AI agents

[![Tests](https://img.shields.io/badge/tests-96%20passed-22c55e)](./tests) [![Python](https://img.shields.io/badge/python-3.9%2B-3572a5)](./backend) [![Next.js](https://img.shields.io/badge/next.js-15-black)](./frontend) [![FastAPI](https://img.shields.io/badge/fastapi-0.115-009688)](./backend)

---

## What it does

The QA RAG Platform ingests your QA documentation (test cases, requirements, execution reports, API contracts) into a vector database, then lets you query it with natural language and run AI agents that automate the most expensive parts of QA work.

### 11 AI Agents

| Agent | What it does |
|---|---|
| **Flaky Test Analyzer** | Upload JUnit XML / Playwright JSON from multiple builds. Gets probabilistic RCA, 10-class failure classification, flaky score 0–100, and before/after code fixes |
| **Generate Test Cases** | Converts requirements into structured functional, negative, boundary, security, and accessibility test cases |
| **Find Duplicates** | Detects near-duplicate test cases and suggests merge actions |
| **Coverage Analysis** | Maps requirements to test cases and surfaces gaps |
| **Root Cause Analysis** | Analyzes execution reports to find root causes |
| **Release Summary** | Generates professional release readiness reports |
| **Explain Failure** | Analyzes Playwright traces and logs with fix suggestions |
| **Automation Recommendations** | Identifies which manual tests should be automated with ROI estimates |
| **Generate Script** | Generates scripts for 15+ frameworks (Playwright, Selenium, Cypress, REST Assured, Postman…) |
| **Test Data Generator** | Creates valid/invalid/boundary/injection test data sets |
| **Automation Pipeline** | Converts test cases to production-ready Playwright + Cucumber BDD + TypeScript POM |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 18, TypeScript, TanStack Query |
| Backend | FastAPI, Python 3.9+, SQLModel, SQLite |
| LLM Router | Groq (primary) + 5-provider fallback (Mistral, Cohere, OpenAI, Gemini) |
| Embeddings | Mistral 1024-dim |
| Vector DB | Pinecone (serverless) |
| Parsers | PDF, XLSX, CSV, DOCX, HTML, MD, JSON, YAML, TS/JS/PY, JUnit XML, Playwright JSON |
| Deployment | Render (backend) + Vercel (frontend) / Docker Compose |

---

## Quick Start (Local)

### Prerequisites
- Python 3.9+
- Node.js 18+
- API keys: Groq, Mistral, Pinecone (all have free tiers)

### 1. Clone and configure

```bash
git clone https://github.com/araushan2010143/AITesterBlueprint3x.git
cd AITesterBlueprint3x/QA_RAG_PLATFORM
cp .env.example .env
# Edit .env and add your API keys
```

### 2. Backend

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

Backend API docs: http://localhost:8000/api/docs

### 3. Frontend

```bash
cd frontend
npm install
npm run dev -- -p 3001
```

App: http://localhost:3001

### 4. Run tests

```bash
# From QA_RAG_PLATFORM root
.venv/bin/python3 -m pytest tests/ -v
# 96 tests: 28 integration + 37 unit scoring + 31 unit parser
```

---

## Docker Compose (full stack)

```bash
cp .env.example .env   # fill in API keys
docker-compose up --build
```

- Backend: http://localhost:8000
- Frontend: http://localhost:3001

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | ✅ | Primary LLM provider — [console.groq.com](https://console.groq.com) (free) |
| `MISTRAL_API_KEY` | ✅ | Embeddings (1024-dim) — [platform.mistral.ai](https://platform.mistral.ai) (free tier) |
| `PINECONE_API_KEY` | ✅ | Vector store — [pinecone.io](https://pinecone.io) (free serverless) |
| `PINECONE_INDEX_NAME` | ✅ | Index name (auto-created on first run, default: `qa-rag-platform`) |
| `COHERE_API_KEY` | ⬜ | Optional reranker — [dashboard.cohere.com](https://dashboard.cohere.com) |

---

## Flaky Test Analyzer — Usage

The flagship feature. Upload test reports from multiple CI builds and get enterprise-grade analysis.

### Supported formats
- **JUnit XML** — Maven Surefire, pytest-junit, Mocha JUnit reporter
- **Playwright JSON** — `playwright test --reporter=json`
- **Plain text** — any `TestName: Build-1=PASS. Build-2=FAIL.` format

### How to compare two builds

1. Go to **AI Actions → Flaky Test Analyzer**
2. Drop `build1_results.json` and `build2_results.json` onto the upload zone **at the same time**
3. Each file auto-parses as Build-1, Build-2 (chips appear)
4. Click **Run — Flaky Test Analyzer**

### Sample test data

```bash
# Two ready-made Playwright JSON reports in sample_data/
sample_data/build1_results.json   # 7 pass / 3 fail
sample_data/build2_results.json   # 4 pass / 6 fail (same test suite)
```

### Flaky Score formula

```
flaky_score = round((1 - pass_rate) × 100)
```

Computed **deterministically in Python** from run history — the LLM never does arithmetic.

| Score | Action |
|---|---|
| 80–100 | Fix Now |
| 50–79 | Quarantine |
| 20–49 | Monitor |
| 0–19 | Stable |

---

## Project Structure

```
QA_RAG_PLATFORM/
├── backend/
│   ├── agents/           # 11 AI agents (flaky_agent.py, test_case_agent.py, …)
│   ├── api/routes/       # FastAPI routes (ai_actions, ingest, search, …)
│   ├── embeddings/       # Mistral embedding client
│   ├── llm/              # Groq router with 6-provider fallback
│   ├── parsers/          # Format parsers (junit_xml, playwright_json, pdf, xlsx, …)
│   ├── vectorstore/      # Pinecone client
│   ├── main.py           # FastAPI app entry point
│   └── requirements.txt
├── frontend/
│   └── src/app/
│       ├── ai/page.tsx   # AI Actions page (all 11 agents)
│       ├── upload/       # Document ingestion
│       ├── search/       # RAG search
│       └── documents/    # Document library
├── tests/
│   ├── test_api.py            # Integration tests (28 tests)
│   ├── test_flaky_scoring.py  # Unit tests — scoring logic (37 tests)
│   ├── test_parsers.py        # Unit tests — format parsers (31 tests)
│   └── conftest.py            # Shared fixtures
├── sample_data/
│   ├── build1_results.json    # Playwright JSON — Build 1 sample
│   └── build2_results.json    # Playwright JSON — Build 2 sample
├── docker-compose.yml
└── .env.example
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/ai/actions` | List all 11 AI agents |
| `POST` | `/api/ai/{action}` | Run an AI agent |
| `POST` | `/api/ai/parse-report` | Parse JUnit XML / Playwright JSON / text |
| `POST` | `/api/ingest/upload` | Ingest a QA document |
| `POST` | `/api/search` | Hybrid RAG search |
| `GET` | `/api/stats/health` | Health check |
| `GET` | `/api/docs` | Swagger UI |

---

## Production Deployment

### Render (Backend) + Vercel (Frontend)

See [architecture.md](./architecture.md) for the full deployment guide.

Quick summary:
1. Push to GitHub
2. Create Render Web Service → set env vars → deploy (`render.yaml` included)
3. Create Vercel project → set `NEXT_PUBLIC_API_URL=https://your-app.onrender.com` → deploy

---

## License

MIT
