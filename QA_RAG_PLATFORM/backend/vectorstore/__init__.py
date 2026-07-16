"""
Pluggable vector store — Pinecone (default) or OpenSearch.

Set VECTOR_STORE=opensearch in .env to activate the OpenSearch backend.
All other code imports from this package to stay backend-agnostic:

  from backend.vectorstore import upsert, query, delete_by_doc_id, get_stats
"""
import os as _os

_BACKEND = _os.getenv("VECTOR_STORE", "pinecone").lower()

if _BACKEND == "opensearch":
    from backend.vectorstore.opensearch_store import (  # noqa: F401
        upsert, query, delete_by_doc_id, get_stats,
    )
    _BACKEND_NAME = "opensearch"
else:
    from backend.vectorstore.pinecone_store import (  # noqa: F401
        upsert, query, delete_by_doc_id, get_stats,
    )
    _BACKEND_NAME = "pinecone"
