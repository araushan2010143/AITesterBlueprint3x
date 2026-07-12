import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from sqlmodel import SQLModel, Field, create_engine, Session, select, JSON, Column
from sqlalchemy import Text
from backend.config import get_settings

settings = get_settings()
engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})


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


def create_db():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
