"""
Qdrant client factory — supports two modes controlled by .env:

  Embedded (default, no Docker needed):
    QDRANT_LOCAL_PATH=./qdrant_storage
    → QdrantClient(path="./qdrant_storage")
    → Data persisted to local directory; no server process required.

  Remote (Docker / cloud):
    QDRANT_LOCAL_PATH=          (leave blank)
    QDRANT_URL=http://localhost:6333
    → QdrantClient(url=..., check_compatibility=False)

The singleton is cached per process via @lru_cache.
"""
from __future__ import annotations
from functools import lru_cache


@lru_cache(maxsize=1)
def get_qdrant_client():
    from qdrant_client import QdrantClient
    from config import get_settings

    s = get_settings()

    if s.qdrant_local_path:
        import os
        os.makedirs(s.qdrant_local_path, exist_ok=True)
        print(f"📦 Qdrant embedded mode → {s.qdrant_local_path}")
        return QdrantClient(path=s.qdrant_local_path)

    print(f"🌐 Qdrant remote mode → {s.qdrant_url}")
    return QdrantClient(
        url=s.qdrant_url,
        api_key=s.qdrant_api_key or None,
    )
