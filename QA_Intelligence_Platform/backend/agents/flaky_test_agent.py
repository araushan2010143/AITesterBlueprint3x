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

    def run(self, query: str, context: dict | None = None, collections: list[str] | None = None) -> AgentResponse:
        result = self._retrieve(query, top_k=5, collections=collections)

        ctx = result.context.strip()
        user_content = (
            f"Context:\n{ctx}\n\nTest in question: {query}"
            if ctx else
            f"Test in question: {query}\n\n"
            "(No knowledge base context available — analyze from your test reliability expertise.)"
        )
        messages = [
            {"role": "system", "content": self._SYSTEM},
            {"role": "user",   "content": user_content},
        ]
        answer = self._llm.chat(messages)

        return AgentResponse(
            answer=answer,
            citations=result.citations,
            agent_id=self.agent_id,
            intent="flaky_test",
        )
