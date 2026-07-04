# RAG Explorer — Interactive Pipeline Visualizer

Enterprise-grade Interactive RAG (Retrieval-Augmented Generation) Explorer built with
**FastAPI + Python** (backend) and **React + TypeScript + Vite** (frontend).

The application provides complete lifecycle observability from PDF ingestion through
ChromaDB storage to Groq LLM answer generation — every stage is animated, inspectable,
and configurable in real-time.

---

## Architecture

```
PDF(s) in data/data/
   ↓
FastAPI backend (main.py)
   ↓
PDF Loader (PyMuPDF) → Text Chunker (LangChain) → Nomic Embedder → ChromaDB
                                                              ↓
User Query → Query Embedder → ChromaDB Similarity Search → Groq LLM → Answer
```

## Technology Stack

| Layer          | Technology                          |
|----------------|-------------------------------------|
| Frontend       | React 18 + TypeScript + Vite 5      |
| Styling        | Tailwind CSS 3 + CSS variables      |
| Pipeline viz   | React Flow 11                       |
| Animations     | Framer Motion 11                    |
| State          | Zustand 4                           |
| Server state   | TanStack Query 5                    |
| Backend        | FastAPI + Uvicorn                   |
| PDF parsing    | PyMuPDF (fitz)                      |
| Chunking       | LangChain RecursiveCharacterSplitter|
| Embeddings     | Nomic embed-text-v1.5 (768-dim)     |
| Vector DB      | ChromaDB (local, persisted)         |
| LLM            | Groq API — llama-3.3-70b-versatile  |

---

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- Groq API key ([console.groq.com](https://console.groq.com))
- Nomic API key ([atlas.nomic.ai](https://atlas.nomic.ai)) OR Ollama with `nomic-embed-text`

### 1 — Place your PDF

```
data/
└── data/
    └── vwo_prd.pdf      ← drop any PDF here
```

### 2 — Backend setup

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Copy .env.example → .env and fill in your keys
cp .env.example .env
```

Edit `.env`:
```env
GROQ_API_KEY=gsk_...
NOMIC_API_KEY=nk-...
```

Start the backend:
```bash
python main.py
# → http://localhost:8000
# → Swagger UI: http://localhost:8000/docs
```

The backend automatically ingests PDFs on startup.

### 3 — Frontend setup

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

---

## Embedding Model Options

### Option A — Nomic API (recommended)

Get a free key at [atlas.nomic.ai](https://atlas.nomic.ai) and set `NOMIC_API_KEY` in `.env`.

### Option B — Ollama (local, no API key)

```bash
ollama pull nomic-embed-text
```

Leave `NOMIC_API_KEY` empty — the backend automatically falls back to Ollama.

---

## API Reference

| Method | Endpoint        | Description                                 |
|--------|-----------------|---------------------------------------------|
| GET    | `/api/status`   | App status and ingestion progress           |
| POST   | `/api/ingest`   | Load PDFs, chunk, embed, store in ChromaDB  |
| POST   | `/api/reindex`  | Rebuild vector DB with new chunking params  |
| GET    | `/api/documents`| List indexed documents                      |
| GET    | `/api/chunks`   | Inspect generated chunks (filterable)       |
| POST   | `/api/query`    | RAG query: retrieve + generate              |
| GET    | `/api/metrics`  | All runtime metrics (document/embed/LLM)    |
| POST   | `/api/upload`   | Drag-and-drop PDF upload                    |
| GET    | `/health`       | Health check                                |

Interactive docs: `http://localhost:8000/docs`

---

## Features

### Pipeline Visualization
Animated React Flow diagram with 7 stages. Each stage glows blue while processing, turns green on completion.

```
📄 PDF → ✂️ Chunker → 🔢 Embedder → 🗄️ ChromaDB → 🔍 Retriever → 🤖 Groq → 💡 Answer
```

### Document Explorer
Hierarchical tree: Document → Pages → Chunks. Click any chunk to preview its text and metadata.

### Ingestion Panel
Live progress tracking with stage labels and a progress bar. Shows document count, pages, chunk count, vector count, and indexing time.

### Query Interface
- Natural language input (Ctrl+Enter to submit)
- Suggested questions seeded for VWO PRD
- Query history with replay

### Answer Panel
- Answer from Groq (context-grounded only)
- Confidence indicator (avg cosine similarity across sources)
- Source citation pills with page numbers

### Retrieval Inspector
- Top-K retrieved chunks with similarity scores visualized as bars
- "Why retrieved" explanation for each chunk
- Chunk metadata: filename, page, chunk ID

### Prompt Inspector
- Full system prompt
- Retrieved context (exactly what was sent to Groq)
- User question
- Token usage breakdown (prompt vs completion)

### Metrics Dashboard
- Document: total docs, pages, chunks, avg chunk size
- Embedding: model, dimension, index time, vector count
- Retrieval: queries, top-K, avg latency, avg similarity
- LLM: requests, avg response time, avg tokens

### Interactive Controls
Adjust and instantly apply:
- Chunk size (200–2000 chars)
- Chunk overlap (0–400 chars)
- Top-K retrieval (1–10)
- Temperature (0–1)
- Max output tokens (128–4096)

Click **Rebuild Vector DB** to reindex with new chunking parameters.

### Drag-and-Drop Upload
Drop a new PDF into the ingestion panel or use the "Upload PDF" button in the header.

---

## Project Structure

```
RAG_PROJECTS/
├── .gitignore
├── README.md
├── backend/
│   ├── .env.example
│   ├── config.py           ← pydantic-settings config
│   ├── main.py             ← FastAPI app + auto-ingestion on startup
│   ├── models.py           ← Pydantic request/response models
│   ├── state.py            ← Global singleton (vectorstore, metrics)
│   ├── requirements.txt
│   ├── api/
│   │   └── routes.py       ← All API endpoints
│   ├── ingestion/
│   │   └── pdf_loader.py   ← PyMuPDF + LangChain text splitter
│   ├── embeddings/
│   │   └── embedder.py     ← Nomic embed-text (API or Ollama)
│   ├── vectorstore/
│   │   └── chroma_store.py ← ChromaDB operations
│   ├── retrieval/
│   │   └── retriever.py    ← Similarity search with scores
│   └── llm/
│       └── groq_llm.py     ← Groq LLM answer generation
├── frontend/
│   ├── package.json
│   ├── vite.config.ts      ← Proxy /api → localhost:8000
│   ├── tailwind.config.ts
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── index.css       ← CSS variables + design tokens
│       ├── types/index.ts  ← TypeScript types
│       ├── store/
│       │   └── ragStore.ts ← Zustand global state
│       ├── services/
│       │   └── api.ts      ← Axios API client
│       ├── hooks/
│       │   ├── useIngest.ts
│       │   ├── useQuery.ts
│       │   └── useMetrics.ts
│       ├── components/
│       │   ├── Header.tsx
│       │   ├── PipelineFlow.tsx
│       │   ├── DocumentExplorer.tsx
│       │   ├── IngestionPanel.tsx
│       │   ├── ControlPanel.tsx
│       │   ├── QueryPanel.tsx
│       │   ├── AnswerPanel.tsx
│       │   ├── RetrievalInspector.tsx
│       │   ├── PromptInspector.tsx
│       │   └── MetricsDashboard.tsx
│       └── pages/
│           └── Home.tsx    ← Three-column layout
├── chroma/                 ← ChromaDB persisted here (auto-created)
└── data/
    └── data/
        └── vwo_prd.pdf     ← Place your PDF here
```

---

## Groq Model

The backend uses `llama-3.3-70b-versatile` by default (configurable via `GROQ_MODEL` env var).
Change it to any Groq-supported model in `.env`:

```env
GROQ_MODEL=llama-3.3-70b-versatile
```

---

## Dark / Light Theme

Click the sun/moon icon in the header to toggle. The design uses CSS variables so every panel and component adapts instantly.

---

## Contributing / Extending

The backend is modular — each module (`embedder.py`, `retriever.py`, `groq_llm.py`) exposes a single factory function. Swap the embedding model, vector store, or LLM provider by editing only the relevant module.
