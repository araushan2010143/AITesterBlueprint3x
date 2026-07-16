import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from sqlmodel import SQLModel, Field, create_engine, Session, select, JSON, Column
from sqlalchemy import Text
from backend.config import get_settings

settings = get_settings()
_db_url = settings.database_url
_connect_args = {"check_same_thread": False} if _db_url.startswith("sqlite") else {}
# PostgreSQL: psycopg2-binary handles connection pooling internally
engine = create_engine(
    _db_url,
    connect_args=_connect_args,
    pool_pre_ping=True,          # detect stale connections (important for Postgres)
    pool_recycle=1800,           # recycle connections every 30 min
)


class Document(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    filename: str
    file_type: str
    file_size: int = 0
    status: str = "processing"   # processing | ready | error
    error: Optional[str] = None

    # Extracted metadata
    document_type: Optional[str] = None   # test_cases | requirements | automation | report | api_docs | general
    module: Optional[str] = None
    feature: Optional[str] = None
    priority: Optional[str] = None
    author: Optional[str] = None
    release: Optional[str] = None
    tags: Optional[str] = None            # comma-separated
    automation_status: Optional[str] = None

    # Stats
    total_pages: int = 0
    total_chunks: int = 0
    total_vectors: int = 0
    namespace: Optional[str] = None       # Pinecone namespace

    # Access scoping — set during ingest so retrieval can filter by team
    team_id: Optional[str] = Field(default=None, index=True)
    # PII / secrets scan summary (JSON string)
    pii_summary: Optional[str] = Field(default=None)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Chunk(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    doc_id: str = Field(foreign_key="document.id", index=True)
    chunk_index: int
    text: str = Field(sa_column=Column(Text))
    page: int = 0
    chunk_strategy: str = "recursive"

    created_at: datetime = Field(default_factory=datetime.utcnow)


class AgentSession(SQLModel, table=True):
    """Stores multi-turn conversation history for agent sessions."""
    __tablename__ = "agent_sessions"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    session_id: str = Field(index=True)
    agent_name: str = Field(default="")
    team_id: Optional[str] = Field(default=None, index=True)
    # JSON array of {"role": "user"|"assistant", "content": "..."}
    messages: str = Field(default="[]", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


def create_db():
    # Import all models so their tables are registered with SQLModel.metadata
    from backend.models import migration_job, migration_standards, audit_log  # noqa: F401
    from backend.models import user, team, team_member  # noqa: F401
    from backend.models import connector       # noqa: F401
    from backend.models import agent_run       # noqa: F401
    from backend.models import agent_review    # noqa: F401
    from backend.models import webhook         # noqa: F401
    from backend.models import prompt_version  # noqa: F401
    from backend.models import refresh_token   # noqa: F401
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
