"""
OpenSearch full-text search client — drop-in BM25 replacement.

When OPENSEARCH_URL is set, this replaces the in-memory rank_bm25 index with a
persistent, scalable full-text search backend that survives restarts and scales
beyond a single process.

Index schema:
  - id:      Pinecone chunk_id (keyword)
  - doc_id:  parent document id (keyword)
  - team_id: team scoping (keyword)
  - text:    chunk text (text, english analyzer)

Usage:
  from backend.retrieval.opensearch_client import os_search, os_index_chunk, os_enabled
  if os_enabled():
      results = os_search(query_text, top_k=20, team_id="team-abc")
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_INDEX_NAME = "qa-rag-chunks"

_client = None
_available: Optional[bool] = None


def _get_client():
    global _client, _available
    if _available is not None:
        return _client

    import os
    url = os.getenv("OPENSEARCH_URL", "")
    if not url:
        _available = False
        return None

    try:
        from opensearchpy import OpenSearch, RequestsHttpConnection
        kwargs: Dict[str, Any] = {
            "hosts":      [url],
            "connection_class": RequestsHttpConnection,
            "timeout":    10,
            "max_retries": 2,
            "retry_on_timeout": True,
        }
        # Optional basic auth
        user = os.getenv("OPENSEARCH_USER", "")
        password = os.getenv("OPENSEARCH_PASSWORD", "")
        if user and password:
            kwargs["http_auth"] = (user, password)

        c = OpenSearch(**kwargs)
        # Ping to verify connectivity
        if not c.ping():
            logger.warning("OpenSearch ping failed — falling back to in-memory BM25")
            _available = False
            return None

        _client = c
        _available = True
        _ensure_index(c)
        logger.info("OpenSearch connected: %s  index: %s", url, _INDEX_NAME)
        return c

    except Exception as exc:
        logger.warning("OpenSearch init failed (%s) — falling back to in-memory BM25", exc)
        _available = False
        return None


def os_enabled() -> bool:
    return _get_client() is not None


def _ensure_index(client) -> None:
    """Create the chunks index if it doesn't exist."""
    if client.indices.exists(index=_INDEX_NAME):
        return
    body = {
        "settings": {
            "number_of_shards":   1,
            "number_of_replicas": 0,
            "analysis": {
                "analyzer": {
                    "qa_text": {
                        "type": "standard",
                        "stopwords": "_english_",
                    }
                }
            },
        },
        "mappings": {
            "properties": {
                "id":      {"type": "keyword"},
                "doc_id":  {"type": "keyword"},
                "team_id": {"type": "keyword"},
                "text":    {"type": "text", "analyzer": "qa_text"},
            }
        },
    }
    try:
        client.indices.create(index=_INDEX_NAME, body=body)
        logger.info("OpenSearch index '%s' created", _INDEX_NAME)
    except Exception as exc:
        logger.warning("OpenSearch index create failed: %s", exc)


def os_index_chunk(chunk_id: str, doc_id: str, text: str, team_id: str = "") -> bool:
    """Index a single chunk into OpenSearch. Returns True on success."""
    c = _get_client()
    if not c:
        return False
    try:
        c.index(
            index=_INDEX_NAME,
            id=chunk_id,
            body={"id": chunk_id, "doc_id": doc_id, "team_id": team_id, "text": text},
            refresh="wait_for",
        )
        return True
    except Exception as exc:
        logger.warning("OpenSearch index_chunk failed: %s", exc)
        return False


def os_index_bulk(chunks: List[Dict[str, Any]]) -> int:
    """
    Bulk index chunks. chunks: [{"id", "doc_id", "text", "team_id"}, ...]
    Returns count of successfully indexed docs.
    """
    c = _get_client()
    if not c or not chunks:
        return 0
    try:
        from opensearchpy.helpers import bulk
        actions = [
            {
                "_index": _INDEX_NAME,
                "_id":    ch["id"],
                "_source": {
                    "id":      ch["id"],
                    "doc_id":  ch.get("doc_id", ""),
                    "team_id": ch.get("team_id", ""),
                    "text":    ch.get("text", ""),
                },
            }
            for ch in chunks
        ]
        success, _ = bulk(c, actions, refresh="wait_for", raise_on_error=False)
        return success
    except Exception as exc:
        logger.warning("OpenSearch bulk index failed: %s", exc)
        return 0


def os_delete_chunk(chunk_id: str) -> bool:
    """Delete a chunk by its ID."""
    c = _get_client()
    if not c:
        return False
    try:
        c.delete(index=_INDEX_NAME, id=chunk_id, ignore=[404])
        return True
    except Exception as exc:
        logger.warning("OpenSearch delete_chunk failed: %s", exc)
        return False


def os_delete_doc(doc_id: str) -> int:
    """Delete all chunks belonging to a document. Returns deleted count."""
    c = _get_client()
    if not c:
        return 0
    try:
        resp = c.delete_by_query(
            index=_INDEX_NAME,
            body={"query": {"term": {"doc_id": doc_id}}},
            refresh=True,
        )
        return resp.get("deleted", 0)
    except Exception as exc:
        logger.warning("OpenSearch delete_doc failed: %s", exc)
        return 0


def os_search(
    query_text: str,
    top_k: int = 20,
    team_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Full-text BM25 search via OpenSearch.
    Returns list of {"chunk_id", "doc_id", "text", "score"}.
    Scores are normalised to [0, 1].
    """
    c = _get_client()
    if not c:
        return []

    must_clauses: List[Dict] = [
        {
            "multi_match": {
                "query":  query_text,
                "fields": ["text^3"],
                "type":   "best_fields",
                "fuzziness": "AUTO",
            }
        }
    ]
    filter_clauses: List[Dict] = []
    if team_id:
        filter_clauses.append({"term": {"team_id": team_id}})

    body: Dict[str, Any] = {
        "size": top_k,
        "query": {
            "bool": {
                "must":   must_clauses,
                "filter": filter_clauses,
            }
        },
        "_source": ["id", "doc_id", "team_id", "text"],
    }

    try:
        resp = c.search(index=_INDEX_NAME, body=body)
    except Exception as exc:
        logger.warning("OpenSearch search failed: %s", exc)
        return []

    hits = resp.get("hits", {}).get("hits", [])
    if not hits:
        return []

    # Normalise scores to [0, 1]
    max_score = resp["hits"].get("max_score") or 1.0
    results = []
    for h in hits:
        src = h.get("_source", {})
        results.append({
            "chunk_id": src.get("id", h["_id"]),
            "doc_id":   src.get("doc_id", ""),
            "text":     src.get("text", ""),
            "score":    round(h["_score"] / max_score, 4),
            "metadata": {"doc_id": src.get("doc_id", ""), "team_id": src.get("team_id", "")},
        })
    return results


def os_health() -> Dict[str, Any]:
    """Return OpenSearch health info for the /health endpoint."""
    c = _get_client()
    if not c:
        return {"enabled": False, "status": "disabled"}
    try:
        h = c.cluster.health(index=_INDEX_NAME, timeout="3s")
        count = c.count(index=_INDEX_NAME).get("count", 0)
        return {
            "enabled":       True,
            "status":        h.get("status", "unknown"),
            "indexed_chunks": count,
            "index":         _INDEX_NAME,
        }
    except Exception as exc:
        return {"enabled": True, "status": "error", "error": str(exc)[:100]}
