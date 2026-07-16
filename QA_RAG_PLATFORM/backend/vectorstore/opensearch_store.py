"""
OpenSearch vector store backend — drop-in replacement for pinecone_store.py.

Requires:
  pip install opensearch-py

Environment variables:
  OPENSEARCH_URL      — e.g. https://localhost:9200 or https://vpc-xxx.us-east-1.es.amazonaws.com
  OPENSEARCH_USER     — (optional) basic-auth username
  OPENSEARCH_PASSWORD — (optional) basic-auth password
  OPENSEARCH_INDEX    — index name (default: qa-rag-platform)
  OPENSEARCH_DIM      — embedding dimension (default: 1024, must match EMBEDDING_DIM)

Index mapping uses the knn_vector field type (k-NN plugin required).
Cosine similarity is used to match Pinecone's metric.

Activate: set VECTOR_STORE=opensearch in .env
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_OPENSEARCH_URL  = os.getenv("OPENSEARCH_URL", "")
_OPENSEARCH_USER = os.getenv("OPENSEARCH_USER", "")
_OPENSEARCH_PASS = os.getenv("OPENSEARCH_PASSWORD", "")
_INDEX_NAME      = os.getenv("OPENSEARCH_INDEX", "qa-rag-platform")
_DIM             = int(os.getenv("OPENSEARCH_DIM", "1024"))

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client

    try:
        from opensearchpy import OpenSearch, RequestsHttpConnection  # type: ignore
        kwargs: Dict[str, Any] = {
            "hosts":      [_OPENSEARCH_URL] if _OPENSEARCH_URL else ["http://localhost:9200"],
            "use_ssl":    _OPENSEARCH_URL.startswith("https"),
            "verify_certs": False,
            "connection_class": RequestsHttpConnection,
        }
        if _OPENSEARCH_USER:
            kwargs["http_auth"] = (_OPENSEARCH_USER, _OPENSEARCH_PASS)
        _client = OpenSearch(**kwargs)
        _ensure_index(_client)
        return _client
    except ImportError:
        raise RuntimeError(
            "opensearch-py is not installed. Run: pip install opensearch-py\n"
            "Or switch back to Pinecone by removing VECTOR_STORE=opensearch from .env"
        )
    except Exception as exc:
        logger.error("OpenSearch client init failed: %s", exc)
        raise


def _ensure_index(client) -> None:
    """Create the knn index if it doesn't exist."""
    if client.indices.exists(index=_INDEX_NAME):
        return
    mapping = {
        "settings": {
            "index": {
                "knn": True,
                "knn.algo_param.ef_search": 100,
            }
        },
        "mappings": {
            "properties": {
                "embedding": {
                    "type":       "knn_vector",
                    "dimension":  _DIM,
                    "method": {
                        "name":        "hnsw",
                        "space_type":  "cosinesimil",
                        "engine":      "nmslib",
                        "parameters":  {"ef_construction": 128, "m": 24},
                    },
                },
                "text":     {"type": "text"},
                "doc_id":   {"type": "keyword"},
                "team_id":  {"type": "keyword"},
                "filename": {"type": "keyword"},
            }
        },
    }
    client.indices.create(index=_INDEX_NAME, body=mapping)
    logger.info("OpenSearch: created index '%s'", _INDEX_NAME)


def upsert(chunks: List[Dict[str, Any]], embeddings: List[List[float]], namespace: str = "") -> int:
    """Upsert chunks + embeddings. Returns number of vectors upserted."""
    client = _get_client()
    body = []
    for chunk, emb in zip(chunks, embeddings):
        meta = {k: v for k, v in chunk["metadata"].items() if isinstance(v, (str, int, float, bool))}
        doc = {"embedding": emb, "text": chunk["text"][:4000], **meta}
        body.append({"index": {"_index": _INDEX_NAME, "_id": chunk["id"]}})
        body.append(doc)

    if not body:
        return 0

    # Bulk in batches of 100
    count = 0
    batch_size = 200   # 100 docs × 2 lines each
    for i in range(0, len(body), batch_size):
        resp = client.bulk(body=body[i: i + batch_size])
        if not resp.get("errors"):
            count += len(body[i: i + batch_size]) // 2
        else:
            for item in resp.get("items", []):
                if "index" in item and not item["index"].get("error"):
                    count += 1

    return count


def query(
    embedding: List[float],
    top_k: int = 10,
    namespace: str = "",
    filter: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Nearest-neighbour search. Returns list of {chunk_id, text, metadata, score}."""
    client = _get_client()

    knn_clause: Dict[str, Any] = {
        "embedding": {
            "vector": embedding,
            "k":      top_k,
        }
    }

    query_body: Dict[str, Any] = {"size": top_k, "query": {"knn": knn_clause}}

    # Apply metadata filters as post-filter (OpenSearch knn + filter approach)
    if filter:
        must_terms = []
        for field, condition in filter.items():
            if isinstance(condition, dict) and "$eq" in condition:
                must_terms.append({"term": {field: condition["$eq"]}})
        if must_terms:
            query_body["query"] = {
                "bool": {
                    "must": [{"knn": knn_clause}],
                    "filter": must_terms,
                }
            }

    resp = client.search(index=_INDEX_NAME, body=query_body)
    results = []
    for hit in resp["hits"]["hits"]:
        src = hit["_source"]
        text = src.pop("text", "")
        emb = src.pop("embedding", None)
        results.append({
            "chunk_id": hit["_id"],
            "text":     text,
            "metadata": {k: v for k, v in src.items()},
            "score":    round(float(hit["_score"]), 4),
        })
    return results


def delete_by_doc_id(doc_id: str, namespace: str = "") -> None:
    """Delete all vectors associated with a doc_id."""
    try:
        client = _get_client()
        client.delete_by_query(
            index=_INDEX_NAME,
            body={"query": {"term": {"doc_id": doc_id}}},
        )
    except Exception as exc:
        logger.warning("OpenSearch delete_by_doc_id failed: %s", exc)


def get_stats() -> Dict[str, Any]:
    """Return index stats."""
    try:
        client = _get_client()
        stats = client.indices.stats(index=_INDEX_NAME)
        total = stats["_all"]["primaries"]["docs"]["count"]
        return {"total_vectors": total, "backend": "opensearch", "index": _INDEX_NAME}
    except Exception:
        return {"total_vectors": 0, "backend": "opensearch", "index": _INDEX_NAME}
