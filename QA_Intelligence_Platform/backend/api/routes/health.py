"""Health check endpoints."""
from fastapi import APIRouter
from config import get_settings

router = APIRouter()


@router.get("/health", tags=["Health"])
def health():
    s = get_settings()
    return {
        "status": "ok",
        "version": "1.0.0",
        "qdrant_url": s.qdrant_url,
        "embedding_model": s.embedding_model,
        "reranker_model": s.reranker_model,
        "llm_providers": {
            "groq":      bool(s.groq_api_key),
            "openai":    bool(s.openai_api_key),
            "mistral":   bool(s.mistral_api_key),
            "anthropic": bool(s.anthropic_api_key),
            "cohere":    bool(s.cohere_api_key),
            "gemini":    bool(s.gemini_api_key),
        },
    }


@router.get("/", tags=["Health"])
def root():
    return {
        "name": "QA Intelligence Platform",
        "version": "1.0.0",
        "docs": "/api/docs",
        "description": "Enterprise QA Knowledge Platform — chat is one interface.",
        "capabilities": [
            "hybrid_retrieval", "multi_collection", "bge_m3_embeddings",
            "cross_encoder_reranking", "multi_agent", "knowledge_graph",
        ],
    }
