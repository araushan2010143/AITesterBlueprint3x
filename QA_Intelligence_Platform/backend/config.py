"""Central settings — loaded once, shared everywhere via get_settings()."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Qdrant
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""

    # Embeddings
    embedding_model: str = "BAAI/bge-m3"
    embedding_device: str = "cpu"
    reranker_model: str = "BAAI/bge-reranker-large"

    # LLM providers
    groq_api_key: str = ""
    openai_api_key: str = ""
    mistral_api_key: str = ""
    anthropic_api_key: str = ""
    cohere_api_key: str = ""
    gemini_api_key: str = ""

    # Neo4j
    neo4j_uri: str = ""
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""

    # JWT
    jwt_secret: str = "CHANGE_ME_IN_PRODUCTION_min32chars!!"
    jwt_expire_minutes: int = 60
    jwt_refresh_expire_days: int = 30

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Database
    database_url: str = "sqlite:///./qa_platform.db"

    # API security
    api_key: str = ""

    # Rate limiting
    rate_limit_disabled: bool = False

    # JIRA
    jira_url: str = ""
    jira_email: str = ""
    jira_api_token: str = ""

    # GitHub
    github_token: str = ""
    github_webhook_secret: str = ""

    # Azure DevOps
    azure_devops_org: str = ""
    azure_devops_pat: str = ""

    # Storage
    upload_dir: str = "./uploads"
    max_upload_mb: int = 100


@lru_cache
def get_settings() -> Settings:
    return Settings()
