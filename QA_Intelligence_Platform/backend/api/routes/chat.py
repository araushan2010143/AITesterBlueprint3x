"""Chat endpoint — QA Assistant with citations."""
from __future__ import annotations
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class ChatRequest(BaseModel):
    query: str
    filters: dict | None = None
    agent: str = "qa_assistant"
    collections: list[str] = []


class ChatResponse(BaseModel):
    answer: str
    citations: list[dict]
    agent_id: str
    intent: str
    elapsed_ms: float = 0.0


@router.post("", response_model=ChatResponse)
def chat(req: ChatRequest):
    """
    Send a query to the QA Assistant (or any registered agent).
    Returns an answer with source citations.

    The full retrieval pipeline runs under the hood:
    Intent → Query Expansion → Hybrid Search → Reranking → LLM → Citations
    """
    from agents import AGENT_REGISTRY
    AgentClass = AGENT_REGISTRY.get(req.agent, AGENT_REGISTRY["qa_assistant"])
    agent = AgentClass()
    t0 = time.time()
    try:
        result = agent.run(req.query, context=req.filters, collections=req.collections or [])
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")
    return ChatResponse(
        answer=result.answer,
        citations=result.citations,
        agent_id=result.agent_id,
        intent=result.intent,
        elapsed_ms=round((time.time() - t0) * 1000, 1),
    )
