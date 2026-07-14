# Architecture — QA RAG Platform

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BROWSER (Next.js 15.3 + React 19)               │
│                                                                         │
│  ┌─────────────────────┐  ┌──────────────────────────────────────────┐  │
│  │  Enterprise Sidebar │  │           Page Content                   │  │
│  │  (Framer Motion)    │  │                                          │  │
│  │  240px ↔ 64px icon  │  │  Dashboard: stat cards (count-up) +     │  │
│  │  Zustand persist    │  │    LLM status widget + quick-launch      │  │
│  │  LLM status dots    │  │                                          │  │
│  │                     │  │  AI Agents: skeleton → card grid         │  │
│  │  ⌘K CommandPalette  │  │    (category badge, complexity dots,    │  │
│  │  (cmdk + backdrop)  │  │     time estimate, accent per agent)     │  │
│  │                     │  │    → detail panel (AnimatePresence)      │  │
│  │  Sonner toasts      │  │    → run button (shimmer + elapsed timer)│  │
│  │  (bottom-right)     │  │    → result (slide-up animation)         │  │
│  └─────────────────────┘  │                                          │  │
│                            │  ┌────────────────────────────────────┐ │  │
│                            │  │  ReportUploadZone (drag-drop)      │ │  │
│                            │  │  FlakyResultViewer (ErrorBoundary) │ │  │
│                            │  │  AutomationResultViewer (tabs)     │ │  │
│                            │  └────────────────────────────────────┘ │  │
│                            └──────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ /api/* (Next.js rewrites proxy)
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        FastAPI Backend (Python 3.9+)                    │
│                                                                         │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────────┐  │
│  │  POST          │  │  POST          │  │  POST /api/ingest/upload  │  │
│  │  /api/ai/      │  │  /api/ai/      │  │                          │  │
│  │  parse-report  │  │  {action}      │  │  dispatcher.py           │  │
│  │                │  │                │  │  → PDF/XLSX/DOCX/MD/     │  │
│  │  auto-detect   │  │  agent router  │  │    HTML/JSON/YAML/       │  │
│  │  format        │  │  dispatch()    │  │    TS/JS/PY parsers      │  │
│  └───────┬────────┘  └───────┬────────┘  └──────────┬───────────────┘  │
│          │                   │                        │                  │
│  ┌───────▼────────────────────▼────────────────────────▼─────────────┐  │
│  │                      Parser Layer                                  │  │
│  │  junit_xml_parser  playwright_json_parser  test_report_normalizer  │  │
│  │  (→ multi-build flat text for agent consumption)                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                       AI Agent Layer                             │   │
│  │                                                                  │   │
│  │  flaky_agent (2-stage)      test_case_agent    coverage_agent   │   │
│  │  ┌──────────────────────┐   duplicate_agent    report_agent     │   │
│  │  │ Stage 1: Classify    │   automation_pipeline_agent           │   │
│  │  │ + Pinecone RAG search│                                       │   │
│  │  │ → 10-class category  │                                       │   │
│  │  │ → run_history array  │                                       │   │
│  │  │ → root_causes        │                                       │   │
│  │  └──────────┬───────────┘                                       │   │
│  │             │ Python enrichment                                  │   │
│  │             │ flaky_score = round((1 - pass_rate) × 100)        │   │
│  │             │ action = Fix Now / Quarantine / Monitor / Stable   │   │
│  │  ┌──────────▼───────────┐                                       │   │
│  │  │ Stage 2: Code fixes  │                                       │   │
│  │  │ + AI narrative report│                                       │   │
│  │  └──────────────────────┘                                       │   │
│  │  Background: index failures → Pinecone (daemon thread)          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        LLM Router (6 providers)                    │ │
│  │                                                                    │ │
│  │  Primary: Groq llama-3.3-70b-versatile (fastest)                  │ │
│  │  Fallback chain:                                                   │ │
│  │    Groq llama-3.1-8b-instant → Mistral/mistral-small-latest →     │ │
│  │    Cohere/command-r-plus → OpenAI/gpt-4o-mini → Gemini/1.5-flash  │ │
│  │                                                                    │ │
│  │  Auto-retry on 429/503 · Token budget tracking · JSON mode        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
┌─────────────────────────┐       ┌─────────────────────────────┐
│   Pinecone (Serverless) │       │      SQLite (qa_rag.db)     │
│                         │       │                             │
│  Namespace: qa-docs     │       │  documents table            │
│  → 1024-dim Mistral     │       │  chunks table               │
│    embeddings           │       │  (metadata, status)         │
│  → cosine similarity    │       │                             │
│                         │       └─────────────────────────────┘
│  Namespace: test-intel  │
│  → failure memory (RAG) │
│  → indexed after each   │
│    flaky analysis run   │
└─────────────────────────┘
```

---

## Data Flow — Flaky Test Analyzer

```
User uploads build1.json + build2.json
          │
          ▼
POST /api/ai/parse-report (×2, sequential)
  test_report_normalizer.normalize(content, build_label="Build-N")
    ├── XML? → junit_xml_parser.parse()
    ├── Playwright JSON? → playwright_json_parser.parse()
    └── Plain text → pass-through
  → "=== Playwright Test Report (Build-1) ===\nAuth › login: Build-1=FAIL..."
          │
          ▼
Frontend appends both parsed texts → textarea
User clicks Run
          │
          ▼
POST /api/ai/flaky_analyzer  { content: "<combined text>" }
          │
          ▼
flaky_agent.run(content)
  1. normalize(content)                    ← re-normalize in case pasted raw
  2. _stage1_classify(normalised)
     a. _search_similar_failures(content)  ← Pinecone RAG (score > 0.82)
     b. chat(CLASSIFY_PROMPT + history)    ← Groq LLM
     c. LLM returns: name, failure_category, confidence,
                     pass_rate, run_history, root_causes, priority
     d. _enrich_test(t) for each test      ← PYTHON (not LLM!)
        flaky_score = round((1 - passes/total) × 100)
        action      = Fix Now | Quarantine | Monitor | Stable
  3. _stage2_fixes(tests, summary)
     a. chat(FIX_PROMPT + concise tests)   ← Groq LLM
     b. returns: fixes{before/after/desc}, ai_report{exec/recommend/breakdown}
  4. Merge fixes → tests
  5. _index_failures_bg(tests)             ← daemon thread, non-blocking
  6. Return full result JSON
          │
          ▼
Frontend renders FlakyResultViewer (wrapped in ErrorBoundary)
  • Summary header (4 stat boxes)
  • Release gate banner (Block/Conditional/Proceed)
  • Category distribution bar chart
  • Per-test cards with score bar, RCA, before/after code diff
  • RAG memory matches (history_matches)
  • AI Intelligence Report (3 cards)
  • Export bar (CSV/XLSX/DOCX/JSON)
```

---

## Key Design Decisions

### 1. Python computes scores — LLM never does arithmetic
LLMs are unreliable for arithmetic. `flaky_score` and `action` are explicitly removed from the LLM output schema. Stage 1 returns only `run_history` (array of PASS/FAIL strings). Python computes the score deterministically with `round((1 - passes/total) * 100)`.

### 2. Two-stage agent pipeline
Stage 1 (classify) and Stage 2 (fix) are separate LLM calls with distinct prompts and token budgets. This gives better quality than a single monolithic prompt and lets Stage 2 receive the enriched (Python-scored) data.

### 3. Non-blocking RAG indexing
After analysis, failures are indexed into Pinecone in a `daemon Thread`. The HTTP response is returned immediately — indexing happens in the background. Future runs receive contextual hints from past analyses.

### 4. Format auto-detection
`test_report_normalizer.normalize()` detects format from content, not filename:
- Starts with `<` → JUnit XML
- Valid JSON with `suites` + `stats` keys → Playwright JSON
- Anything else → plain text pass-through

### 5. Error Boundary + toStr() for LLM output safety
The LLM occasionally returns structured objects where strings are expected (e.g., `defect_breakdown` as `{"product_bugs": 2}`). A `toStr()` helper converts any value to a renderable string. A React `ErrorBoundary` class prevents a single render crash from black-screening the entire app.

---

## Production Deployment

### Option A: Render + Vercel (recommended free tier)

**Backend on Render**

1. Push to GitHub
2. New → Web Service → connect repo
3. Root directory: `QA_RAG_PLATFORM` (not `/backend` — needed so `from backend.xxx import` resolves)
4. Build command: `pip install -r backend/requirements.txt`
5. Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
6. Add environment variables: `GROQ_API_KEY`, `MISTRAL_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, and optionally `COHERE_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`
7. Free instance type is fine for demos (spins down after 15 min idle)

**24/7 keep-alive** (Render free tier spins down after 15 min of inactivity):
- `.github/workflows/keep-alive.yml` — GitHub Actions cron pings `/api/stats/health` every 10 minutes
- UptimeRobot external monitor — pings the same endpoint every 5 minutes
- Health endpoint accepts `GET` and `HEAD` (UptimeRobot default): `@router.api_route("/health", methods=["GET","HEAD"])`

**Frontend on Vercel**

1. New Project → import repo
2. Root directory: `QA_RAG_PLATFORM/frontend`
3. Framework: Next.js (auto-detected)
4. Install command: `npm install --legacy-peer-deps` (required for React 19 + Next.js 15.3 peer deps)
5. Environment variable: `NEXT_PUBLIC_API_URL=https://<your-render-app>.onrender.com`
6. Deploy

### Option B: Docker Compose (self-hosted / VPS)

```bash
# On any Ubuntu VPS (DigitalOcean $4/mo, Railway, Fly.io)
git clone https://github.com/araushan2010143/AITesterBlueprint3x.git
cd AITesterBlueprint3x/QA_RAG_PLATFORM
cp .env.example .env   # fill in keys
docker-compose up -d
```

---

## Enterprise UI Architecture

```
src/
├── lib/
│   └── store.ts          Zustand store (persist middleware)
│                         sidebarCollapsed  ← persisted to localStorage
│                         commandOpen       ← ephemeral (not persisted)
│
├── components/
│   ├── Sidebar.tsx       motion.aside  width: 240px ↔ 64px
│   │                     ├── Logo + collapse toggle
│   │                     ├── ⌘K search trigger
│   │                     ├── NavItem  (layoutId="sidebar-active" pill)
│   │                     ├── Recent items
│   │                     └── LLMStatus  GET /api/llm/status  30s refetch
│   │                           └── provider list  overflowY:auto  maxH:140
│   │
│   └── CommandPalette.tsx  AnimatePresence modal + blur backdrop
│                           cmdk Command.List with Pages + AI Agents groups
│                           Global keydown: ⌘K toggle · ESC close
│
└── app/
    ├── layout.tsx        QueryClientProvider + Sidebar + CommandPalette + Toaster
    │
    ├── page.tsx          Dashboard
    │   ├── StatCard      Framer Motion stagger entrance + CountUp animation
    │   ├── LLMStatusWidget  live dots, refresh button, 30s auto-refresh
    │   ├── QuickLaunchWidget  4 agent shortcuts (whileHover lift)
    │   ├── Charts        recharts PieChart (by type) + BarChart (by module)
    │   └── DocRow        per-row slide-in entrance + relative timeAgo stamp
    │
    └── ai/page.tsx       AI Agents
        ├── SkeletonCard  shimmer placeholder grid (9 cards) while loading
        ├── ActionCard    motion.button
        │   ├── accent colour per ACTION_META category
        │   ├── category badge (uppercase pill)
        │   ├── ComplexityDots (3 dots, green/amber/red)
        │   └── time estimate (~5s … ~30s)
        ├── AnimatePresence  grid → detail slide transition
        ├── Run button    motion.button, shimmer sweep, live elapsed timer
        └── Result panels  motion.div slide-up on arrival
```

### State flow

```
User clicks sidebar toggle
  → useAppStore.toggleSidebar()
  → Zustand updates sidebarCollapsed
  → persist middleware writes to localStorage["qa-rag-ui"]
  → motion.aside animates width: 64px ↔ 240px (spring ease)
  → spacer motion.div mirrors the same width animation (layout shift prevention)

User presses ⌘K
  → global keydown handler in CommandPalette.tsx
  → useAppStore.setCommandOpen(true)
  → AnimatePresence mounts: backdrop (opacity 0→1) + modal (scale 0.96→1, y -8→0)
  → cmdk filters items as user types, router.push on select
```

---

## Test Architecture

```
tests/
├── conftest.py              — JUnit XML / Playwright JSON / mock LLM fixtures
├── test_api.py              — 28 integration tests (FastAPI TestClient, LLM mocked)
│   ├── TestListActions      — GET /api/ai/actions
│   ├── TestParseReport      — POST /api/ai/parse-report (XML, JSON, text, edge cases)
│   ├── TestFlakyAnalyzer    — POST /api/ai/flaky_analyzer (full pipeline, LLM mocked)
│   └── TestHealth           — GET /api/stats/health, GET /
├── test_flaky_scoring.py    — 37 unit tests (pure Python, no mocks needed)
│   ├── TestScoreFromHistory — all-pass, all-fail, mixed, edge cases
│   ├── TestScoreFromPassRate— string parsing, invalid input, bounds
│   ├── TestActionFromScore  — all 4 thresholds + boundary values
│   └── TestEnrichTest       — full enrichment, history override, fallbacks
└── test_parsers.py          — 31 unit tests
    ├── TestJUnitXMLParser   — single/nested suite, pass/fail/skip/error
    ├── TestPlaywrightJSONParser — pass/fail/retry/nested/stats
    └── TestNormalizer       — format detection, build labels, multi-build merge
```

Run: `.venv/bin/python3 -m pytest tests/ -v`

---

## LLM Failure Classification — 10 Categories

| Category | Trigger |
|---|---|
| **Product Bug** | App defect — wrong API response, UI regression, broken feature |
| **Automation Bug** | Test code defect — wrong selector, bad assertion, hardcoded value |
| **Timing Issue** | Async race condition — spinner not awaited, animation incomplete |
| **Test Data** | Stale/missing DB data, shared state, test ordering dependency |
| **Infrastructure** | CI runner crash, OOM, Docker restart, disk full |
| **Environment** | Missing env var, wrong config, port conflict, DB connection refused |
| **Network** | External API timeout, DNS failure, rate-limited 3rd party |
| **State Leakage** | Dirty state from previous test, missing beforeEach/afterAll |
| **Flaky** | Non-deterministic — passes on immediate retry with zero changes |
| **Unknown** | Insufficient evidence to classify |
