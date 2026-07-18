"""QA Assistant — general QA knowledge, framework help, best practices."""
from __future__ import annotations
from .base_agent import BaseAgent, AgentResponse
from llm.router import LLMRouter


class QAAssistant(BaseAgent):
    agent_id    = "qa_assistant"
    description = "General QA knowledge: framework help, test design, best practices, automation guidance."

    def __init__(self):
        super().__init__()
        self._llm = LLMRouter()

    def run(self, query: str, context: dict | None = None) -> AgentResponse:
        result = self._retrieve(query, filters=context)

        messages = [
            {"role": "system", "content": self._build_system_prompt()},
            {"role": "user",   "content": (
                f"Context:\n{result.context}\n\n"
                f"Question: {query}\n\n"
                "Answer with citations."
            )},
        ]
        answer = self._llm.chat(messages)

        return AgentResponse(
            answer=answer,
            citations=result.citations,
            agent_id=self.agent_id,
            intent=result.intent,
        )
