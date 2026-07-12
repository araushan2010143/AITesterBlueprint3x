from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ── Mistral (embeddings) ─────────────────────────────────────────────────
    mistral_api_key: str = ""
    embedding_model: str = "mistral-embed"
    embedding_dim: int = 1024
    mistral_chat_model: str = "mistral-small-latest"   # also used as LLM fallback

    # ── Pinecone ─────────────────────────────────────────────────────────────
    pinecone_api_key: str = ""
    pinecone_index_name: str = "qa-rag-platform"
    pinecone_region: str = "us-east-1"

    # ── Groq (primary LLM) ───────────────────────────────────────────────────
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    groq_fallback_model: str = "llama-3.1-8b-instant"  # independent TPD quota

    # ── Cohere (reranker + LLM fallback) ────────────────────────────────────
    cohere_api_key: str = ""
    cohere_chat_model: str = "command-r-plus"

    # ── Optional LLM providers (add keys to .env to activate) ───────────────
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"

    # ── App ──────────────────────────────────────────────────────────────────
    upload_dir: str = "uploads"
    database_url: str = "sqlite:///./qa_rag.db"
    max_chunk_size: int = 1000
    chunk_overlap: int = 200
    bm25_weight: float = 0.3
    dense_weight: float = 0.7

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
