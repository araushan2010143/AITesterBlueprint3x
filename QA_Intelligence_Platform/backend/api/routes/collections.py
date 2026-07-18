"""Collection management endpoints."""
from fastapi import APIRouter

router = APIRouter()


@router.get("")
def list_collections():
    """List all Qdrant collections with vector counts."""
    from database.qdrant_client import get_qdrant_client
    from collections_module.manager import get_collection_stats

    return {"collections": get_collection_stats(get_qdrant_client())}


@router.get("/schema")
def list_schemas():
    """Return the expected schema for each collection."""
    from collections_module.schema import COLLECTIONS
    return {
        name: {
            "description":     col.description,
            "source_type":     col.source_type,
            "indexed_fields":  col.indexed_fields,
        }
        for name, col in COLLECTIONS.items()
    }
