"""QA RAG Platform — Enterprise FastAPI backend."""
import os
from pathlib import Path

# Load .env into os.environ BEFORE any module-level os.getenv() calls
# (vault_service, redis_client, neo4j_client all read env at import time)
try:
    from dotenv import load_dotenv as _load_dotenv
    _load_dotenv(Path(__file__).parent.parent / ".env", override=False)
except ImportError:
    pass
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database.db import create_db
from backend.config import get_settings
from backend.middleware.auth import APIKeyMiddleware
from backend.middleware.rate_limit import RateLimitMiddleware
from backend.middleware.audit_log_mw import AuditLogMiddleware
from backend.api.routes import (
    ingest, search, ai_actions, documents, stats, llm_status,
    migration_v2, scanner, analytics, auth,
)
from backend.api.routes import (
    test_execution, connectors, graph,
    agents as agents_router, saml, webhooks, audit as audit_router,
    prompts as prompts_router,
)

settings = get_settings()

Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="QA RAG Platform",
    description="Enterprise QA Knowledge & AI Platform — multi-format RAG + AI agents + Migration Studio",
    version="5.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
# Set ALLOWED_ORIGINS env var to restrict. Defaults to "*" (dev).
_origins_raw = os.getenv("ALLOWED_ORIGINS", settings.allowed_origins)
_origins = [o.strip() for o in _origins_raw.split(",") if o.strip()] if _origins_raw != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Security + rate limit + audit (IMPORTANT: order matters — outermost first) ─
app.add_middleware(AuditLogMiddleware)   # innermost: logs after response status is known
app.add_middleware(RateLimitMiddleware)
app.add_middleware(APIKeyMiddleware)    # outermost: rejects before other middleware runs

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(ingest.router)
app.include_router(search.router)
app.include_router(ai_actions.router)
app.include_router(documents.router)
app.include_router(stats.router)
app.include_router(llm_status.router)
app.include_router(migration_v2.router)
app.include_router(scanner.router)
app.include_router(analytics.router)
app.include_router(auth.router)
app.include_router(test_execution.router)
app.include_router(connectors.router)
app.include_router(graph.router)
app.include_router(agents_router.router)
app.include_router(saml.router)
app.include_router(webhooks.router)
app.include_router(audit_router.router)
app.include_router(prompts_router.router)


@app.on_event("startup")
def on_startup():
    create_db()
    from backend.graph.neo4j_client import init_graph
    init_graph()
    from backend.telemetry import setup_telemetry
    setup_telemetry(app)


@app.on_event("shutdown")
def on_shutdown():
    from backend.graph.neo4j_client import close
    close()


@app.get("/")
def root():
    return {
        "name": "QA RAG Platform",
        "version": "6.0.0",
        "docs": "/api/docs",
        "features": [
            "21 source integrations",
            "6-stage AI migration pipeline",
            "Project Scanner + Readiness Score",
            "Hybrid RAG search (Pinecone + BM25)",
            "12 AI agents",
            "6-provider LLM router",
            "GitHub / GitLab / Azure DevOps / Bitbucket PR generation",
            "Real-time SSE progress streaming",
        ],
    }


@app.get("/health")
def health():
    from backend.services.vault_service import health as vault_health
    from backend.graph.neo4j_client import health as graph_health
    from backend.retrieval.opensearch_client import os_health, os_enabled
    from backend.telemetry import _setup_done as otel_active
    return {
        "status":      "ok",
        "version":     "7.0.0",
        "vault":       vault_health(),
        "graph":       graph_health(),
        "opensearch":  os_health(),
        "telemetry":   {"enabled": otel_active},
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
