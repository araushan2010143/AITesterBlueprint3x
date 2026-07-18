"""QA Intelligence Platform — FastAPI entry point."""
from dotenv import load_dotenv
load_dotenv()  # Must be before all other local imports

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from database.db import init_db
from api.routes import chat, search, ingest, agents, health
from api.routes import collections


@asynccontextmanager
async def lifespan(app: FastAPI):
    import os
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    init_db()
    # Pre-warm embedder + Qdrant in startup (single-threaded) so concurrent
    # requests never race on first initialization.
    from pipeline.embedder import get_embedder
    from database.qdrant_client import get_qdrant_client
    get_qdrant_client()
    emb = get_embedder()
    emb.embed(["startup warmup"])  # trigger any lazy PyTorch init once
    print("✅ Embedder and Qdrant ready", flush=True)
    yield


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
        allow_origins=["http://localhost:3000", "https://*.vercel.app"],
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

    return app


app = build_app()
