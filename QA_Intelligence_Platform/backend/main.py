"""QA Intelligence Platform — FastAPI entry point."""
from dotenv import load_dotenv
load_dotenv()  # Must be before all other local imports

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from database.db import init_db
from api.routes import chat, search, ingest, agents, health, admin
from api.routes import collections


@asynccontextmanager
async def lifespan(app: FastAPI):
    import os
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    init_db()

    # Best-effort warmup — never crash startup; embedder + Qdrant init lazily
    # on first real request if this fails (e.g. env vars not set yet).
    try:
        from pipeline.embedder import get_embedder
        from database.qdrant_client import get_qdrant_client
        get_qdrant_client()
        get_embedder().embed(["warmup"])
        print("✅ Embedder and Qdrant ready", flush=True)
    except Exception as exc:
        print(f"⚠️  Startup warmup skipped ({type(exc).__name__}: {exc})", flush=True)
        print("    Ensure HF_API_KEY, QDRANT_URL, QDRANT_API_KEY are set.", flush=True)

    from services.scheduler import start_scheduler, stop_scheduler
    start_scheduler(interval_hours=1)
    yield
    stop_scheduler()


def build_app() -> FastAPI:
    s = get_settings()

    app = FastAPI(
        title="QA Intelligence Platform",
        description=(
            "Enterprise QA Knowledge Platform. "
            "Chat is one interface — the Knowledge Layer is the product."
        ),
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "https://*.vercel.app",
            "https://qabuddy-app.vercel.app",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(chat.router,        prefix="/api/chat",        tags=["Chat"])
    app.include_router(search.router,      prefix="/api/search",      tags=["Search"])
    app.include_router(ingest.router,      prefix="/api/ingest",      tags=["Ingest"])
    app.include_router(agents.router,      prefix="/api/agents",      tags=["Agents"])
    app.include_router(collections.router, prefix="/api/collections",  tags=["Collections"])
    app.include_router(admin.router,       prefix="/api/admin",         tags=["Admin"])

    return app


app = build_app()
