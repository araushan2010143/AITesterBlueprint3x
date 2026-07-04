"""FastAPI application entry point with auto-ingestion on startup."""
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router, _run_ingestion
from config import settings
from state import app_state


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Auto-ingest on startup if PDFs exist; silently skip if none found."""
    try:
        _run_ingestion(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
            rebuild=False
        )
        print(f"[startup] RAG pipeline ready — {len(app_state.chunks)} chunks indexed.")
    except Exception as exc:
        print(f"[startup] Auto-ingest skipped: {exc}")
        app_state.status = "idle"
    yield


app = FastAPI(
    title="RAG Explorer API",
    description="Interactive RAG pipeline: PDF → Chunking → Embedding → ChromaDB → Retrieval → Groq LLM",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok", "rag_status": app_state.status}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
