"""SHA256 index registry — tracks which chunks are already indexed in Qdrant."""
from __future__ import annotations
import sqlite3
import os

_DB_PATH = os.getenv("REGISTRY_DB", "./index_registry.db")


def _conn():
    con = sqlite3.connect(_DB_PATH)
    con.execute(
        "CREATE TABLE IF NOT EXISTS index_registry "
        "(collection TEXT, sha256 TEXT, PRIMARY KEY(collection, sha256))"
    )
    con.commit()
    return con


def load_hashes(collection: str) -> set[str]:
    with _conn() as con:
        rows = con.execute(
            "SELECT sha256 FROM index_registry WHERE collection = ?", (collection,)
        ).fetchall()
    return {r[0] for r in rows}


def save_hash(collection: str, sha256: str) -> None:
    with _conn() as con:
        con.execute(
            "INSERT OR IGNORE INTO index_registry VALUES (?, ?)", (collection, sha256)
        )
        con.commit()


def clear_collection(collection: str) -> None:
    with _conn() as con:
        con.execute("DELETE FROM index_registry WHERE collection = ?", (collection,))
        con.commit()
