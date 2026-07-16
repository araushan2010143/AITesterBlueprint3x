"""
Neo4j driver singleton — optional.

When NEO4J_URI is not configured, all operations silently no-op and return
empty results. This mirrors the Redis optional pattern: the platform works
without a graph database in dev; add Neo4j (Cloud Aura or self-hosted) for
production impact analysis.

Dev quick-start:
  docker run -p 7474:7474 -p 7687:7687 \
    -e NEO4J_AUTH=neo4j/password neo4j:5

Set env vars:
  NEO4J_URI=bolt://localhost:7687
  NEO4J_USER=neo4j
  NEO4J_PASSWORD=password
"""
from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from typing import Any, Dict, Generator, List, Optional

logger = logging.getLogger(__name__)

_driver = None
_graph_enabled = False


def _init_driver() -> None:
    global _driver, _graph_enabled
    from backend.config import get_settings
    s = get_settings()
    uri = s.neo4j_uri or os.getenv("NEO4J_URI", "")
    if not uri:
        logger.info("NEO4J_URI not set — Knowledge Graph disabled.")
        return
    user = s.neo4j_user or os.getenv("NEO4J_USER", "neo4j")
    password = s.neo4j_password or os.getenv("NEO4J_PASSWORD", "")
    try:
        from neo4j import GraphDatabase
        _driver = GraphDatabase.driver(uri, auth=(user, password))
        _driver.verify_connectivity()
        _graph_enabled = True
        logger.info("Neo4j connected: %s", uri)
    except Exception as exc:
        logger.warning("Neo4j unavailable (%s) — graph features disabled.", exc)
        _driver = None
        _graph_enabled = False


def init_graph() -> None:
    """Call once on application startup."""
    _init_driver()
    if _graph_enabled:
        from backend.graph.schema import apply_schema
        apply_schema()


def is_enabled() -> bool:
    return _graph_enabled


@contextmanager
def session() -> Generator:
    """Yield a Neo4j session, or raise RuntimeError if graph is disabled."""
    if not _graph_enabled or _driver is None:
        raise RuntimeError("Neo4j is not configured. Set NEO4J_URI to enable the Knowledge Graph.")
    with _driver.session() as s:
        yield s


def run_query(
    cypher: str,
    parameters: Optional[Dict[str, Any]] = None,
    *,
    write: bool = False,
) -> List[Dict[str, Any]]:
    """
    Execute a Cypher query and return results as a list of dicts.
    Returns [] when Neo4j is disabled.
    """
    if not _graph_enabled or _driver is None:
        return []
    try:
        with _driver.session() as s:
            if write:
                result = s.execute_write(lambda tx: list(tx.run(cypher, parameters or {})))
            else:
                result = s.execute_read(lambda tx: list(tx.run(cypher, parameters or {})))
            return [dict(r) for r in result]
    except Exception as exc:
        logger.error("Neo4j query error: %s | Cypher: %s", exc, cypher[:200])
        return []


def health() -> Dict[str, Any]:
    """Return a connectivity status dict for the /health endpoint."""
    if not _graph_enabled:
        return {"enabled": False, "status": "disabled"}
    try:
        rows = run_query("RETURN 1 AS ping")
        ok = bool(rows and rows[0].get("ping") == 1)
        return {"enabled": True, "status": "ok" if ok else "unreachable"}
    except Exception as exc:
        return {"enabled": True, "status": "error", "detail": str(exc)[:200]}


def close() -> None:
    global _driver, _graph_enabled
    if _driver:
        _driver.close()
    _driver = None
    _graph_enabled = False
