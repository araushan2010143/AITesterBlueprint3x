"""RTM Builder — Requirements Traceability Matrix from PRD + test cases + JIRA."""
from __future__ import annotations
from .base_agent import BaseAgent, AgentResponse
from llm.router import LLMRouter


class RTMBuilder(BaseAgent):
    agent_id    = "rtm_builder"
    description = "Builds Requirements Traceability Matrix: PRD → User Stories → Test Cases → Automation."

    _SYSTEM = """You are a QA architect building a Requirements Traceability Matrix (RTM).
Given requirements and test cases, output a structured RTM in this format:

| Requirement ID | Requirement | User Story | Test Case IDs | Automation Status | Coverage |
|---|---|---|---|---|---|
| REQ-001 | ... | US-01 | TC-101, TC-102 | Automated | ✓ |

Mark gaps clearly. Requirements with no test cases = COVERAGE GAP."""

    def __init__(self):
        super().__init__()
        self._llm = LLMRouter()

    def run(self, query: str, context: dict | None = None, collections: list[str] | None = None) -> AgentResponse:
        col = collections or []
        prd_result  = self._retrieve(query, top_k=5, collections=col or ["prd"])
        test_result = self._retrieve(query, top_k=5, collections=col or ["testcases"])
        jira_result = self._retrieve(query, top_k=3, collections=col or ["jira"])

        combined = "\n\n---\n\n".join([
            f"[REQUIREMENTS]\n{prd_result.context}",
            f"[TEST CASES]\n{test_result.context}",
            f"[JIRA STORIES]\n{jira_result.context}",
        ])

        messages = [
            {"role": "system", "content": self._SYSTEM},
            {"role": "user",   "content": f"Context:\n{combined}\n\nBuild RTM for: {query}"},
        ]
        answer = self._llm.chat(messages, max_tokens=2000)
        citations = prd_result.citations + test_result.citations + jira_result.citations

        return AgentResponse(
            answer=answer,
            citations=citations,
            agent_id=self.agent_id,
            intent="rtm",
        )
