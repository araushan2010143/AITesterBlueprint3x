"""Base agent — all specialized agents inherit from this."""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from knowledge import RetrievalEngine


@dataclass
class AgentResponse:
    answer: str
    citations: list[dict[str, str]]
    agent_id: str
    intent: str
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseAgent(ABC):
    agent_id: str = "base"
    description: str = ""

    def __init__(self):
        self._retrieval = RetrievalEngine()

    @abstractmethod
    def run(self, query: str, context: dict | None = None) -> AgentResponse:
        """Execute the agent for a given query."""
        ...

    def _retrieve(self, query: str, filters: dict | None = None, top_k: int = 5):
        return self._retrieval.retrieve(query, metadata_filters=filters, top_k=top_k)

    def _build_system_prompt(self) -> str:
        return (
            "You are an expert QA engineer and software architect. "
            "Answer based only on the provided context. "
            "Always cite your sources. "
            "If the context doesn't contain enough information, say so clearly."
        )
