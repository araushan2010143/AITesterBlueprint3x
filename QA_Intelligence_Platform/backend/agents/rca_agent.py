"""
RCA Agent — Root Cause Analysis from logs + commits + JIRA + history.

Query flow:
  Input: bug ID / log snippet / stack trace
  → Retrieve relevant logs, JIRA issues, code commits
  → Synthesize probable root cause with evidence chain
"""
from __future__ import annotations
from .base_agent import BaseAgent, AgentResponse
from llm.router import LLMRouter


class RCAAgent(BaseAgent):
    agent_id    = "rca"
    description = "Root Cause Analysis: synthesizes logs, commits, JIRA history into probable root cause."

    _SYSTEM = """You are a senior QA and DevOps engineer specializing in root cause analysis.
Given logs, code, and JIRA history, identify:
1. Probable root cause (most likely explanation)
2. Contributing factors
3. Evidence chain (which log line / commit / test points to this)
4. Recommended fix
Be concise and precise. Cite every source."""

    def __init__(self):
        super().__init__()
        self._llm = LLMRouter()

    def run(self, query: str, context: dict | None = None) -> AgentResponse:
        # RCA needs logs + JIRA + code
        log_result  = self._retrieve(query, filters={"source": "logs"},   top_k=3)
        jira_result = self._retrieve(query, filters={"source": "jira"},   top_k=3)
        code_result = self._retrieve(query, top_k=2)

        combined_context = "\n\n---\n\n".join(filter(None, [
            f"[LOGS]\n{log_result.context}",
            f"[JIRA]\n{jira_result.context}",
            f"[CODE]\n{code_result.context}",
        ]))

        messages = [
            {"role": "system", "content": self._SYSTEM},
            {"role": "user",   "content": f"Context:\n{combined_context}\n\nIssue: {query}"},
        ]
        answer = self._llm.chat(messages, max_tokens=1500)

        all_citations = log_result.citations + jira_result.citations + code_result.citations

        return AgentResponse(
            answer=answer,
            citations=all_citations,
            agent_id=self.agent_id,
            intent="rca",
        )
