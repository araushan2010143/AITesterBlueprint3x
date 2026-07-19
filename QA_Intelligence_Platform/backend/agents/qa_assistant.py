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

    def run(self, query: str, context: dict | None = None, collections: list[str] | None = None) -> AgentResponse:
        result = self._retrieve(query, filters=context, collections=collections)

        ctx = result.context.strip()
        if ctx:
            user_content = f"Context:\n{ctx}\n\nQuestion: {query}\n\nAnswer with citations."
        else:
            user_content = (
                f"Question: {query}\n\n"
                "No knowledge base context was retrieved (knowledge base may be empty or "
                "the retrieval service is not configured). Answer from your QA expertise."
            )
        messages = [
            {"role": "system", "content": self._build_system_prompt()},
            {"role": "user",   "content": user_content},
        ]
        answer = self._llm.chat(messages)

        return AgentResponse(
            answer=answer,
            citations=result.citations,
            agent_id=self.agent_id,
            intent=result.intent,
        )
