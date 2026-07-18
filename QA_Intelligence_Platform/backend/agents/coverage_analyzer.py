"""Coverage Analyzer — identifies requirements with no test coverage."""
from __future__ import annotations
from .base_agent import BaseAgent, AgentResponse
from llm.router import LLMRouter


class CoverageAnalyzer(BaseAgent):
    agent_id    = "coverage_analyzer"
    description = "Identifies requirements with no test cases, modules with no automation."

    _SYSTEM = """You are a QA coverage analyst. Given requirements and test cases:
1. List requirements WITH coverage (test case IDs)
2. List requirements WITHOUT coverage (GAPS — highlight these)
3. List modules/features with 0% automation
4. Overall coverage percentage estimate
Be precise. Cite requirement IDs and test case IDs."""

    def __init__(self):
        super().__init__()
        self._llm = LLMRouter()

    def run(self, query: str, context: dict | None = None) -> AgentResponse:
        prd_result  = self._retrieve(query, filters={"source": "prd"},       top_k=8)
        test_result = self._retrieve(query, filters={"source": "testcases"}, top_k=8)

        combined = "\n\n---\n\n".join([
            f"[REQUIREMENTS]\n{prd_result.context}",
            f"[TEST CASES]\n{test_result.context}",
        ])

        messages = [
            {"role": "system", "content": self._SYSTEM},
            {"role": "user",   "content": f"Context:\n{combined}\n\nAnalyze coverage for: {query}"},
        ]
        answer = self._llm.chat(messages, max_tokens=1500)

        return AgentResponse(
            answer=answer,
            citations=prd_result.citations + test_result.citations,
            agent_id=self.agent_id,
            intent="coverage",
        )
