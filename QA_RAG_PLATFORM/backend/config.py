from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Mistral
    mistral_api_key: str = ""
    embedding_model: str = "mistral-embed"
    embedding_dim: int = 1024

    # Pinecone
    pinecone_api_key: str = ""
    pinecone_index_name: str = "qa-rag-platform"
    pinecone_region: str = "us-east-1"

    # Groq
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # Cohere (optional reranker)
    cohere_api_key: str = ""

    # App
    upload_dir: str = "uploads"
    database_url: str = "sqlite:///./qa_rag.db"
    max_chunk_size: int = 1000
    chunk_overlap: int = 200
    bm25_weight: float = 0.3   # weight for BM25 in hybrid search
    dense_weight: float = 0.7  # weight for dense search

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
