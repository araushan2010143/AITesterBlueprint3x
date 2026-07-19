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
    def run(self, query: str, context: dict | None = None, collections: list[str] | None = None) -> AgentResponse:
        """Execute the agent for a given query."""
        ...

    def _retrieve(self, query: str, filters: dict | None = None, top_k: int = 5, collections: list[str] | None = None):
        return self._retrieval.retrieve(query, metadata_filters=filters, top_k=top_k, collections_override=collections or [])

    def _build_system_prompt(self) -> str:
        return (
            "You are an expert QA engineer and software architect with deep knowledge of "
            "test automation, Selenium, Playwright, JIRA, CI/CD pipelines, and QA best practices. "
            "When knowledge base context is provided, prioritize it and cite your sources. "
            "When no context is available (empty knowledge base or retrieval unavailable), "
            "draw on your QA expertise to give a thorough, accurate answer — and note that "
            "no specific project context was found."
        )
