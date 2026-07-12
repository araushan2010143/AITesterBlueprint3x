"""LLM Router status — shows which providers are available and which are muted."""
from fastapi import APIRouter
from backend.llm.router import get_router

router = APIRouter(prefix="/api/llm", tags=["LLM Router"])


@router.get("/status")
def llm_status():
    """
    Returns the live status of every configured LLM provider.

    Example response:
    {
      "providers": [
        {"name": "Groq/llama-3.3-70b-versatile", "available": false, "resets_in_s": 1820},
        {"name": "Groq/llama-3.1-8b-instant",    "available": true,  "resets_in_s": 0},
        {"name": "Mistral/mistral-small-latest",  "available": true,  "resets_in_s": 0}
      ],
      "available_count": 2,
      "total_count": 3
    }
    """
    r = get_router()
    providers = r.status()
    return {
        "providers": providers,
        "available_count": r.available_count(),
        "total_count": len(providers),
    }
