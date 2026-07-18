"""Agent endpoints — run any registered specialized agent."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any

router = APIRouter()


class AgentRunRequest(BaseModel):
    query: str
    context: dict[str, Any] | None = None


class AgentRunResponse(BaseModel):
    answer: str
    citations: list[dict]
    agent_id: str
    intent: str
    metadata: dict


@router.get("")
def list_agents():
    """List all registered agents."""
    from agents import AGENT_REGISTRY
    return {
        "agents": [
            {"id": k, "description": v.description}
            for k, v in AGENT_REGISTRY.items()
        ]
    }


@router.post("/{agent_id}/run", response_model=AgentRunResponse)
def run_agent(agent_id: str, req: AgentRunRequest):
    """Run a specific agent by ID."""
    from agents import AGENT_REGISTRY
    AgentClass = AGENT_REGISTRY.get(agent_id)
    if AgentClass is None:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    agent = AgentClass()
    result = agent.run(req.query, context=req.context)
    return AgentRunResponse(
        answer=result.answer,
        citations=result.citations,
        agent_id=result.agent_id,
        intent=result.intent,
        metadata=result.metadata,
    )
