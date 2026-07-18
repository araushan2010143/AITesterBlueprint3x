"""Database engine + table creation."""
from sqlmodel import SQLModel, create_engine, Session
from config import get_settings

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        s = get_settings()
        connect_args = {"check_same_thread": False} if "sqlite" in s.database_url else {}
        _engine = create_engine(s.database_url, connect_args=connect_args)
    return _engine


def init_db():
    SQLModel.metadata.create_all(get_engine())


def get_session():
    with Session(get_engine()) as session:
        yield session
