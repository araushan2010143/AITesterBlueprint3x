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

    # ── Security ─────────────────────────────────────────────────────────────
    # Set API_KEY to a secret string to enable auth. Empty = dev mode (open).
    api_key: str = ""
    # Comma-separated allowed CORS origins. "*" = open (dev). Set in prod!
    allowed_origins: str = "*"
    # Set to "true" to disable rate limiting (testing only).
    rate_limit_disabled: str = "false"

    # ── PII + Secret scanning ─────────────────────────────────────────────────
    # pii_action:    flag | redact | block
    #   flag   = ingest but flag in audit log (default)
    #   redact = replace PII with placeholders before indexing
    #   block  = reject upload entirely if PII is detected
    pii_action: str = "flag"
    # secret_action: redact | block
    #   redact = replace detected secrets with placeholders (default)
    #   block  = reject upload if secrets are detected
    secret_action: str = "redact"

    # ── Retrieval confidence + citations ──────────────────────────────────────
    # Below this score the /ask endpoint returns an abstain response instead
    # of risking a hallucinated answer.
    retrieval_abstain_threshold: float = 0.40
    # How many citations to attach to every /ask response.
    retrieval_top_n_citations: int = 5

    # ── Connector sync tuning ─────────────────────────────────────────────────
    jira_page_delay_ms: int = 50
    confluence_page_delay_ms: int = 50

    # ── Celery task queue (optional — uses REDIS_URL as broker when set) ─────
    # Override broker separately if using a different broker for tasks vs cache.
    celery_broker_url:  str = ""   # e.g. redis://localhost:6379/1
    celery_result_backend: str = ""  # defaults to same as broker if empty

    # ── SAML 2.0 SSO (optional — requires python3-saml + libxmlsec1) ─────────
    # Set these from your IdP's metadata XML (use POST /api/auth/saml/configure to parse it).
    saml_sp_entity_id:    str = ""  # e.g. https://yourapp.com/api/auth/saml/metadata
    saml_sp_callback_url: str = ""  # e.g. https://yourapp.com/api/auth/saml/callback
    saml_idp_entity_id:   str = ""
    saml_idp_sso_url:     str = ""  # IdP SSO endpoint
    saml_idp_slo_url:     str = ""  # IdP SLO endpoint (optional)
    saml_idp_cert:        str = ""  # base64 X.509 cert, no -----BEGIN----- wrapper
    saml_sp_cert:         str = ""  # SP cert (for signed requests, optional)
    saml_sp_key:          str = ""  # SP private key (for signed requests, optional)
    saml_strict:          str = "true"
    saml_debug:           str = "false"

    # ── Agent LLM tuning ──────────────────────────────────────────────────────
    agent_temperature: float = 0.2      # lower = more deterministic agent outputs
    agent_max_tokens:  int   = 4096     # max LLM tokens per agent turn

    # ── Neo4j Knowledge Graph (optional) ──────────────────────────────────────
    # When neo4j_uri is empty the graph layer is silently disabled.
    # Dev: docker run -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:5
    # Prod: Neo4j AuraDB or self-hosted.
    neo4j_uri: str = ""
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
