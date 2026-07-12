"""QA RAG Platform — Enterprise FastAPI backend."""
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database.db import create_db
from backend.config import get_settings
from backend.api.routes import ingest, search, ai_actions, documents, stats

settings = get_settings()

# Ensure upload dir exists
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="QA RAG Platform",
    description="Enterprise QA Knowledge & AI Platform — multi-format RAG + 9 AI agents",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router)
app.include_router(search.router)
app.include_router(ai_actions.router)
app.include_router(documents.router)
app.include_router(stats.router)


@app.on_event("startup")
def on_startup():
    create_db()


@app.get("/")
def root():
    return {
        "name": "QA RAG Platform",
        "version": "1.0.0",
        "docs": "/api/docs",
        "supported_formats": ["PDF", "XLSX", "CSV", "DOCX", "HTML", "MD", "JSON", "YAML", "TS", "JS", "PY"],
        "ai_actions": ["generate_test_cases", "find_duplicates", "coverage_analysis", "rca",
                       "release_summary", "explain_failure", "automate", "generate_script", "test_data"],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
