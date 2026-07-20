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
    import time
    from backend.services.vault_service import health as vault_health
    from backend.graph.neo4j_client import health as graph_health
    from backend.retrieval.opensearch_client import os_health, os_enabled
    from backend.telemetry import _setup_done as otel_active

    # --- Database ---
    db_status: dict = {"status": "unknown"}
    try:
        from backend.database.db import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = {"status": "healthy", "ok": True}
    except Exception as e:
        db_status = {"status": "down", "ok": False, "error": str(e)[:120]}

    # --- LLM Router ---
    llm_status: dict = {"available_count": 0, "total_count": 0, "providers": []}
    try:
        from backend.llm.router import get_router
        r = get_router()
        providers = r.status()
        llm_status = {
            "available_count": r.available_count(),
            "total_count": len(providers),
            "providers": providers,
        }
    except Exception as e:
        llm_status = {"available_count": 0, "total_count": 0, "providers": [], "error": str(e)[:120]}

    # --- Redis ---
    redis_status: dict = {"status": "unknown"}
    try:
        redis_url = os.getenv("REDIS_URL") or os.getenv("CELERY_BROKER_URL")
        if redis_url:
            import redis as redis_lib
            r = redis_lib.from_url(redis_url, socket_connect_timeout=2)
            t0 = time.time()
            r.ping()
            redis_status = {"status": "healthy", "ok": True, "latency_ms": round((time.time() - t0) * 1000)}
        else:
            redis_status = {"status": "unknown", "ok": False, "error": "REDIS_URL not set"}
    except Exception as e:
        redis_status = {"status": "down", "ok": False, "error": str(e)[:80]}

    # --- Vector Store (Pinecone) ---
    vector_status: dict = {"status": "unknown", "backend": "pinecone"}
    try:
        from pinecone import Pinecone
        api_key = os.getenv("PINECONE_API_KEY")
        if api_key:
            t0 = time.time()
            pc = Pinecone(api_key=api_key)
            idx_name = os.getenv("PINECONE_INDEX_NAME", "qa-rag-platform")
            idx = pc.Index(idx_name)
            stats = idx.describe_index_stats()
            vector_status = {
                "status": "healthy", "ok": True, "backend": "pinecone",
                "latency_ms": round((time.time() - t0) * 1000),
                "stats": {"vectors": str(stats.total_vector_count or 0)},
            }
        else:
            vector_status = {"status": "unknown", "ok": False, "backend": "pinecone", "error": "PINECONE_API_KEY not set"}
    except Exception as e:
        vector_status = {"status": "down", "ok": False, "backend": "pinecone", "error": str(e)[:80]}

    # --- Env var presence (boolean only — never expose values) ---
    env_keys = [
        "MISTRAL_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY",
        "PINECONE_API_KEY", "NEO4J_URI", "REDIS_URL",
        "VAULT_ADDR", "OPENSEARCH_URL", "CELERY_BROKER_URL", "DATABASE_URL",
    ]
    env_status = {k: bool(os.getenv(k)) for k in env_keys}

    return {
        "status":       "ok",
        "version":      "7.0.0",
        "database":     db_status,
        "llm":          llm_status,
        "redis":        redis_status,
        "vector_store": vector_status,
        "vault":        vault_health(),
        "graph":        graph_health(),
        "opensearch":   os_health(),
        "telemetry":    {"enabled": otel_active},
        "env":          env_status,
    }


@app.get("/api/debug/network")
def debug_network():
    """
    Diagnostic endpoint — tests raw network reachability of LLM API hosts
    using both urllib (stdlib, no httpx) and httpx to isolate the root cause.
    """
    import socket, ssl, urllib.request

    hosts = [
        ("Groq",    "api.groq.com"),
        ("Mistral", "api.mistral.ai"),
        ("OpenAI",  "api.openai.com"),
        ("Cohere",  "api.cohere.com"),
        ("Gemini",  "generativelanguage.googleapis.com"),
    ]

    results = {}
    for name, host in hosts:
        entry: dict = {}

        # 1. DNS
        try:
            entry["dns"] = socket.gethostbyname(host)
        except Exception as e:
            entry["dns"] = f"FAIL: {e}"
            results[name] = entry
            continue

        # 2. TCP connect (raw socket, no SSL)
        try:
            with socket.create_connection((host, 443), timeout=8) as s:
                entry["tcp"] = "ok"
        except Exception as e:
            entry["tcp"] = f"FAIL: {type(e).__name__}: {e}"
            results[name] = entry
            continue

        # 3. TLS via urllib (Python stdlib, no httpx dependency)
        try:
            ctx = ssl.create_default_context()
            req = urllib.request.Request(f"https://{host}/", headers={"User-Agent": "diag/1.0"})
            with urllib.request.urlopen(req, context=ctx, timeout=8) as r:
                entry["urllib_tls"] = f"ok (HTTP {r.status})"
        except urllib.error.HTTPError as e:
            entry["urllib_tls"] = f"ok (HTTP {e.code})"
        except Exception as e:
            entry["urllib_tls"] = f"FAIL: {type(e).__name__}: {e}"

        # 4. httpx TLS
        try:
            import httpx
            with httpx.Client(timeout=8.0, verify=True) as client:
                r = client.get(f"https://{host}/", follow_redirects=False)
            entry["httpx_tls"] = f"ok (HTTP {r.status_code})"
        except Exception as e:
            cause = getattr(e, "__cause__", None)
            entry["httpx_tls"] = f"FAIL: {type(e).__name__}: {e}" + (f" ← {type(cause).__name__}: {cause}" if cause else "")

        results[name] = entry

    # 5. Real Groq API call
    groq_test: dict = {}
    try:
        from backend.config import get_settings
        s = get_settings()
        if not s.groq_api_key:
            groq_test = {"status": "skipped", "reason": "GROQ_API_KEY not set"}
        else:
            from openai import OpenAI
            client = OpenAI(api_key=s.groq_api_key, base_url="https://api.groq.com/openai/v1", timeout=15.0)
            resp = client.chat.completions.create(
                model=s.groq_model,
                messages=[{"role": "user", "content": "Say OK"}],
                max_tokens=5,
            )
            groq_test = {"status": "ok", "response": resp.choices[0].message.content}
    except Exception as e:
        cause = getattr(e, "__cause__", None) or getattr(e, "__context__", None)
        cause2 = getattr(cause, "__cause__", None) if cause else None
        groq_test = {
            "status": "error",
            "error": f"{type(e).__name__}: {e}",
            "cause": f"{type(cause).__name__}: {cause}" if cause else None,
            "root_cause": f"{type(cause2).__name__}: {cause2}" if cause2 else None,
        }

    return {"code_version": "debug-v2", "network": results, "groq_api_test": groq_test}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
