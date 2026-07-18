"""Flaky Test Agent — analyzes retry patterns, locator stability, environment noise."""
from __future__ import annotations
from .base_agent import BaseAgent, AgentResponse
from llm.router import LLMRouter


class FlakyTestAgent(BaseAgent):
    agent_id    = "flaky_test"
    description = "Analyzes flaky tests: retry patterns, locator stability, timing issues, environment factors."

    _SYSTEM = """You are a test reliability expert. Analyze flaky test evidence and provide:
1. Flaky score (0–100, where 100 = confirmed flaky)
2. Root cause category: [LOCATOR|TIMING|NETWORK|DATA|ENVIRONMENT|RACE_CONDITION]
3. Evidence (which test runs / logs show the pattern)
4. Recommended fix
Cite sources for every claim."""

    def __init__(self):
        super().__init__()
        self._llm = LLMRouter()

    def run(self, query: str, context: dict | None = None) -> AgentResponse:
        result = self._retrieve(
            query,
            filters={"source": "logs"},
            top_k=5,
        )

        messages = [
            {"role": "system", "content": self._SYSTEM},
            {"role": "user",   "content": f"Context:\n{result.context}\n\nTest in question: {query}"},
        ]
        answer = self._llm.chat(messages)

        return AgentResponse(
            answer=answer,
            citations=result.citations,
            agent_id=self.agent_id,
            intent="flaky_test",
        )
