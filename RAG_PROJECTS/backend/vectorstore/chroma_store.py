"""
Native ChromaDB 0.4.x client — no LangChain wrapper.
Stores pre-computed embeddings directly; cosine similarity space.
"""
from pathlib import Path
from typing import List, Dict, Any

import chromadb
from chromadb.config import Settings as ChromaSettings


def get_client(persist_directory: str) -> chromadb.PersistentClient:
    Path(persist_directory).mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(
        path=str(persist_directory),
        settings=ChromaSettings(anonymized_telemetry=False)
    )


def get_or_create_collection(client: chromadb.PersistentClient, name: str):
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"}
    )


def recreate_collection(client: chromadb.PersistentClient, name: str):
    """Drop and recreate collection (used by /reindex)."""
    try:
        client.delete_collection(name)
    except Exception:
        pass
    return client.create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"}
    )


def _sanitize_metadata(meta: Dict[str, Any]) -> Dict[str, Any]:
    """ChromaDB only accepts str / int / float / bool metadata values."""
    return {k: v for k, v in meta.items() if isinstance(v, (str, int, float, bool))}


def add_chunks_with_embeddings(
    collection,
    chunks: List[Dict[str, Any]],
    embeddings: List[List[float]],
    batch_size: int = 100
) -> int:
    """Upsert chunks + pre-computed embeddings into ChromaDB."""
    added = 0
    for i in range(0, len(chunks), batch_size):
        batch_c = chunks[i : i + batch_size]
        batch_e = embeddings[i : i + batch_size]

        collection.upsert(
            ids=[c["id"] for c in batch_c],
            embeddings=batch_e,
            documents=[c["text"] for c in batch_c],
            metadatas=[_sanitize_metadata(c["metadata"]) for c in batch_c]
        )
        added += len(batch_c)
    return added


def collection_count(collection) -> int:
    return collection.count()


def collection_info(collection, persist_directory: str) -> Dict[str, Any]:
    return {
        "collection_name": collection.name,
        "vector_count": collection.count(),
        "storage_path": str(persist_directory),
        "persistence": "persisted"
    }
