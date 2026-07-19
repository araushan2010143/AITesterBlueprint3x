---
title: QA Intelligence API
emoji: 🧪
colorFrom: red
colorTo: orange
sdk: docker
app_port: 8000
pinned: false
---

# QA Intelligence Platform — Backend API

FastAPI backend powering the QA Intelligence Platform. Provides document ingestion,
semantic search, AI chat, and test generation endpoints backed by Qdrant vector store
and BAAI/bge-m3 embeddings.

## Environment Variables (set in HF Space Secrets)

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Groq LLM key |
| `QDRANT_URL` | Yes | Qdrant Cloud cluster URL |
| `QDRANT_API_KEY` | Yes | Qdrant Cloud API key |
| `QDRANT_LOCAL_PATH` | No | Leave blank for Qdrant Cloud |
| `JWT_SECRET` | Yes | Random 32+ char string |
| `OPENAI_API_KEY` | No | Optional OpenAI fallback |
