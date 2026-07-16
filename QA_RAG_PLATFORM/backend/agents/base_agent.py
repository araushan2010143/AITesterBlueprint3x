"""
BaseAgent — abstract foundation for all QA intelligence agents.

Subclass contract:
  name         — agent identifier string
  description  — one-line description
  build_prompt(task, rag_context, graph_context) → str
  parse_output(raw_text, task)                   → dict

The base class handles:
  - RAG context retrieval (via hybrid_search)
  - Knowledge Graph context (via neo4j_client, optional)
  - LLM call (Groq primary, with error handling)
  - JSON extraction from LLM response
  - Timing + token tracking
  - AgentRun persistence
"""
from __future__ import annotations

import json
import logging
import re
import time
import uuid
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple

from backend.agents.schemas import AgentTask, AgentResult, Citation
from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# ── JSON extraction helper ─────────────────────────────────────────────────────

def extract_json(text: str) -> Any:
    """
    Pull JSON out of LLM output. Handles:
      - raw JSON
      - ```json ... ``` fenced blocks
      - JSON embedded in prose (extracts first {...} or [...])
    """
    # Try raw parse first
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # Try fenced code block
    m = re.search(r'```(?:json)?\s*([\s\S]+?)\s*```', text)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Try first JSON array
    m = re.search(r'(\[[\s\S]+\])', text)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass

    # Try first JSON object
    m = re.search(r'(\{[\s\S]+\})', text)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass

    return None


# ── LLM call utility ──────────────────────────────────────────────────────────

def call_llm(
    system_prompt: str,
    user_message: str,
    temperature: float = 0.2,
    max_tokens: int = 4096,
    history: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[str, int]:
    """
    Call Groq LLM with optional multi-turn history.
    history format: [{"role": "user"|"assistant", "content": "..."}]
    Returns (response_text, tokens_used).
    """
    import groq as groq_sdk
    client = groq_sdk.Groq(api_key=settings.groq_api_key)
    messages: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    if history:
        # Limit to last 10 turns to stay within context window
        messages.extend(history[-20:])
    messages.append({"role": "user", "content": user_message})
    response = client.chat.completions.create(
        model=settings.groq_model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    text = response.choices[0].message.content or ""
    tokens = response.usage.total_tokens if response.usage else 0
    return text, tokens


# ── Base class ─────────────────────────────────────────────────────────────────

class BaseAgent(ABC):
    name: str = "base"
    description: str = ""

    @abstractmethod
    def build_prompt(
        self,
        task: AgentTask,
        rag_context: str,
        graph_context: str,
    ) -> Tuple[str, str]:
        """Return (system_prompt, user_message)."""
        ...

    @abstractmethod
    def parse_output(self, raw: str, task: AgentTask) -> Dict[str, Any]:
        """Parse raw LLM output into structured agent output dict."""
        ...

    # ── Context gathering ──────────────────────────────────────────────────────

    def _gather_rag_context(self, task: AgentTask) -> Tuple[str, List[Citation]]:
        """Retrieve relevant RAG chunks for the task query."""
        if not task.query and not task.node_id:
            return "", []
        query = task.query or f"{task.node_type} {task.node_id}"
        try:
            from backend.retrieval.hybrid_search import search as hybrid_search
            team_filter = {"team_id": {"$eq": task.team_id}} if task.team_id else None
            results, _ = hybrid_search(
                query_text=query,
                top_k=task.top_k,
                pinecone_filter=team_filter,
            )
            if not results:
                return "", []

            citations = [
                Citation(
                    chunk_id=r.get("chunk_id", ""),
                    doc_id=r.get("metadata", {}).get("doc_id", ""),
                    filename=r.get("metadata", {}).get("filename", ""),
                    excerpt=r.get("text", "")[:200],
                    score=round(r.get("score", 0.0), 4),
                )
                for r in results
            ]
            context = "\n\n---\n\n".join(
                f"[Source: {r.get('metadata', {}).get('filename', '?')}]\n{r.get('text', '')}"
                for r in results
            )
            return context, citations
        except Exception as exc:
            logger.warning("RAG context error for agent %s: %s", self.name, exc)
            return "", []

    def _gather_graph_context(self, task: AgentTask) -> str:
        """Pull relevant graph traversal data when node_id is set."""
        if not task.node_id or not task.node_type:
            return ""
        try:
            from backend.graph import neo4j_client
            if not neo4j_client.is_enabled():
                return ""
            from backend.graph import impact_analyzer as ia
            label = task.node_type
            nid = task.node_id
            if label == "Story":
                data = ia.get_story_impact(nid, team_id=task.team_id)
            elif label == "Requirement":
                data = ia.get_requirement_impact(nid, team_id=task.team_id)
            elif label == "Module":
                data = ia.get_module_impact(nid, team_id=task.team_id)
            else:
                return ""
            return json.dumps(data, indent=2)
        except Exception as exc:
            logger.warning("Graph context error for agent %s: %s", self.name, exc)
            return ""

    # ── Main run ──────────────────────────────────────────────────────────────

    def _load_session_history(self, session_id: str) -> List[Dict[str, Any]]:
        """Load prior conversation turns from AgentSession table."""
        import json
        from sqlmodel import Session, select
        from backend.database.db import engine, AgentSession
        try:
            with Session(engine) as db:
                row = db.exec(
                    select(AgentSession).where(AgentSession.session_id == session_id)
                ).first()
                return json.loads(row.messages) if row else []
        except Exception as exc:
            logger.warning("Failed to load session history %s: %s", session_id, exc)
            return []

    def _save_session_history(
        self,
        session_id: str,
        user_msg: str,
        assistant_reply: str,
        team_id: Optional[str],
    ) -> None:
        """Append this turn to AgentSession and persist."""
        import json
        from datetime import datetime
        from sqlmodel import Session, select
        from backend.database.db import engine, AgentSession
        try:
            with Session(engine) as db:
                row = db.exec(
                    select(AgentSession).where(AgentSession.session_id == session_id)
                ).first()
                history = json.loads(row.messages) if row else []
                history.append({"role": "user",      "content": user_msg})
                history.append({"role": "assistant",  "content": assistant_reply})
                if row:
                    row.messages   = json.dumps(history)
                    row.updated_at = datetime.utcnow()
                else:
                    db.add(AgentSession(
                        session_id=session_id,
                        agent_name=self.name,
                        team_id=team_id,
                        messages=json.dumps(history),
                    ))
                db.commit()
        except Exception as exc:
            logger.warning("Failed to save session history %s: %s", session_id, exc)

    def run(
        self,
        task: AgentTask,
        run_id: Optional[str] = None,
    ) -> AgentResult:
        run_id = run_id or str(uuid.uuid4())
        t0 = time.time()

        from backend.telemetry import trace_agent_run
        with trace_agent_run(self.name, task.task_type, team_id=task.team_id) as span:
            # Load multi-turn history when session_id provided
            history: List[Dict[str, Any]] = []
            if task.session_id:
                history = self._load_session_history(task.session_id)

            try:
                rag_ctx, citations = self._gather_rag_context(task)
                graph_ctx = self._gather_graph_context(task)
                sys_prompt, user_msg = self.build_prompt(task, rag_ctx, graph_ctx)
                raw, tokens = call_llm(sys_prompt, user_msg, history=history or None)
                output = self.parse_output(raw, task)

                # Persist this turn to session memory
                if task.session_id:
                    self._save_session_history(task.session_id, user_msg, raw, task.team_id)
                latency = int((time.time() - t0) * 1000)

                try:
                    span.set_attribute("agent.tokens_used", tokens)
                    span.set_attribute("agent.latency_ms",  latency)
                    span.set_attribute("agent.status",      "done")
                except Exception:
                    pass

                self._persist(run_id, task, "done", output, tokens, latency)
                return AgentResult(
                    run_id=run_id,
                    agent_name=self.name,
                    task_type=task.task_type,
                    status="done",
                    output=output,
                    citations=citations,
                    tokens_used=tokens,
                    latency_ms=latency,
                )
            except Exception as exc:
                latency = int((time.time() - t0) * 1000)
                logger.exception("Agent %s failed: %s", self.name, exc)
                try:
                    span.set_attribute("agent.status", "failed")
                except Exception:
                    pass
                self._persist(run_id, task, "failed", {}, 0, latency, error=str(exc)[:500])
                return AgentResult(
                    run_id=run_id,
                    agent_name=self.name,
                    task_type=task.task_type,
                    status="failed",
                    error=str(exc)[:500],
                    latency_ms=latency,
                )

    def _persist(
        self,
        run_id: str,
        task: AgentTask,
        status: str,
        output: dict,
        tokens: int,
        latency: int,
        error: Optional[str] = None,
    ) -> None:
        try:
            from sqlmodel import Session
            from backend.database.db import engine
            from backend.models.agent_run import AgentRun
            import datetime
            with Session(engine) as db:
                run = AgentRun(
                    id=run_id,
                    agent_name=self.name,
                    task_type=task.task_type,
                    status=status,
                    input_json=task.model_dump_json(),
                    output_json=json.dumps(output),
                    error=error,
                    tokens_used=tokens,
                    latency_ms=latency,
                    team_id=task.team_id,
                    created_by=task.created_by,
                    completed_at=datetime.datetime.utcnow(),
                )
                db.add(run)
                db.commit()
        except Exception as exc:
            logger.warning("Failed to persist agent run %s: %s", run_id, exc)
