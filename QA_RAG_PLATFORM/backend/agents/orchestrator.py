"""
AgentOrchestrator — central router for all QA intelligence agents.

Responsibilities:
  - Agent registry (maps task_type → agent instance)
  - Synchronous run() returning AgentResult
  - Async stream_events() generator for SSE streaming
  - Chained agent runs (output of one becomes input to next)
  - run_history() for past runs from DB
  - run_defect_pipeline() for the full LangGraph multi-agent DAG

Usage:
  from backend.agents.orchestrator import orchestrator
  result = orchestrator.run(AgentTask(task_type="rca", query="login fails on Safari"))

  # Full pipeline:
  result = orchestrator.run_defect_pipeline(bug_description="...", bug_id="KAN-42")
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional, Type

from backend.agents.base_agent import BaseAgent
from backend.agents.schemas import AgentTask, AgentResult
from backend.agents.requirement_agent import RequirementAgent
from backend.agents.story_agent import StoryAgent
from backend.agents.impact_agent import ImpactAgent
from backend.agents.rca_agent import RCAAgent
from backend.agents.factcheck_agent import FactCheckAgent
from backend.agents.severity_prediction_agent import SeverityPredictionAgent
from backend.agents.assignment_agent import AssignmentAgent
from backend.agents.regression_recommendation_agent import RegressionRecommendationAgent
from backend.agents.environment_agent import EnvironmentAgent
from backend.agents.release_risk_agent import ReleaseRiskAgent
from backend.agents.code_change_agent import CodeChangeAgent
from backend.agents.log_analysis_agent import LogAnalysisAgent
from backend.agents.screenshot_analysis_agent import ScreenshotAnalysisAgent

logger = logging.getLogger(__name__)

# Task type → agent class
_REGISTRY: Dict[str, Type[BaseAgent]] = {
    "requirement_analysis":      RequirementAgent,
    "story_generation":          StoryAgent,
    "impact_analysis":           ImpactAgent,
    "rca":                       RCAAgent,
    "fact_check":                FactCheckAgent,
    "severity_prediction":       SeverityPredictionAgent,
    "assignment":                AssignmentAgent,
    "regression_recommendation": RegressionRecommendationAgent,
    "environment_analysis":      EnvironmentAgent,
    "release_risk":              ReleaseRiskAgent,
    "code_change":               CodeChangeAgent,
    "log_analysis":              LogAnalysisAgent,
    "screenshot_analysis":       ScreenshotAnalysisAgent,
}


class AgentOrchestrator:
    """Singleton orchestrator — use the module-level `orchestrator` instance."""

    def __init__(self) -> None:
        # Instantiate one agent per type (stateless, safe to share)
        self._agents: Dict[str, BaseAgent] = {
            task_type: cls() for task_type, cls in _REGISTRY.items()
        }

    # ── Registry ──────────────────────────────────────────────────────────────

    def register(self, task_type: str, agent: BaseAgent) -> None:
        """Register a custom agent at runtime."""
        self._agents[task_type] = agent
        logger.info("Registered agent '%s' for task type '%s'", agent.name, task_type)

    def agent_for(self, task_type: str) -> Optional[BaseAgent]:
        return self._agents.get(task_type)

    def list_agents(self) -> List[Dict[str, str]]:
        return [
            {"task_type": tt, "agent_name": a.name, "description": a.description}
            for tt, a in self._agents.items()
        ]

    # ── Single run ────────────────────────────────────────────────────────────

    def run(self, task: AgentTask, run_id: Optional[str] = None) -> AgentResult:
        """Run a single agent synchronously. Returns AgentResult."""
        agent = self._agents.get(task.task_type)
        if not agent:
            return AgentResult(
                run_id=run_id or str(uuid.uuid4()),
                agent_name="orchestrator",
                task_type=task.task_type,
                status="failed",
                error=f"No agent registered for task_type '{task.task_type}'. "
                      f"Available: {list(self._agents)}",
            )
        logger.info("Orchestrator dispatching task '%s' to agent '%s'", task.task_type, agent.name)
        return agent.run(task, run_id=run_id)

    # ── Chained pipeline ──────────────────────────────────────────────────────

    def run_pipeline(self, tasks: List[AgentTask]) -> List[AgentResult]:
        """
        Run a sequence of tasks where each task may reference the previous output.
        The output of task N is injected into task N+1 as task.items (if list)
        or as task.extra["prev_output"] (if dict).
        """
        results: List[AgentResult] = []
        prev_output: Optional[Dict] = None
        for task in tasks:
            if prev_output is not None:
                # Inject chained output
                items = prev_output.get("requirements") or prev_output.get("stories")
                if isinstance(items, list):
                    task.items = items
                else:
                    task.extra["prev_output"] = prev_output
            result = self.run(task)
            results.append(result)
            if result.status == "done":
                prev_output = result.output
        return results

    # ── SSE streaming ─────────────────────────────────────────────────────────

    async def stream_events(self, task: AgentTask) -> AsyncGenerator[str, None]:
        """
        Async generator yielding SSE-formatted strings.
        Runs the agent in a thread so it doesn't block the event loop.
        """
        import asyncio
        run_id = str(uuid.uuid4())

        yield _sse("start", {"run_id": run_id, "task_type": task.task_type, "agent": self._agents.get(task.task_type, object).__class__.__name__})

        try:
            loop = asyncio.get_running_loop()
            result: AgentResult = await loop.run_in_executor(
                None,
                lambda: self.run(task, run_id=run_id),
            )
            if result.status == "done":
                yield _sse("result", result.model_dump())
                yield _sse("done", {"run_id": run_id, "tokens": result.tokens_used, "latency_ms": result.latency_ms})
            else:
                yield _sse("error", {"run_id": run_id, "error": result.error})
        except Exception as exc:
            logger.exception("Orchestrator stream error: %s", exc)
            yield _sse("error", {"run_id": run_id, "error": str(exc)[:400]})

    # ── History ───────────────────────────────────────────────────────────────

    def run_history(
        self,
        team_id: Optional[str] = None,
        agent_name: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict]:
        try:
            from sqlmodel import Session, select
            from backend.database.db import engine
            from backend.models.agent_run import AgentRun
            with Session(engine) as db:
                stmt = select(AgentRun).order_by(AgentRun.created_at.desc()).limit(limit)
                if team_id:
                    stmt = stmt.where(AgentRun.team_id == team_id)
                if agent_name:
                    stmt = stmt.where(AgentRun.agent_name == agent_name)
                runs = db.exec(stmt).all()
                return [
                    {
                        "run_id":     r.id,
                        "agent":      r.agent_name,
                        "task_type":  r.task_type,
                        "status":     r.status,
                        "tokens":     r.tokens_used,
                        "latency_ms": r.latency_ms,
                        "created_at": r.created_at.isoformat(),
                        "error":      r.error,
                    }
                    for r in runs
                ]
        except Exception as exc:
            logger.warning("History fetch failed: %s", exc)
            return []

    # ── LangGraph defect pipeline ─────────────────────────────────────────────

    def run_defect_pipeline(
        self,
        bug_description: str,
        bug_id: str = "",
        team_id: Optional[str] = None,
        release_date: str = "",
        component: str = "",
        environment: str = "",
        affected_users: int = 0,
        team_members: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Run the full 6-stage LangGraph defect intelligence pipeline:
        RCA → Impact → Severity → Assignment → Regression → Release Risk.
        Returns a dict with all stage outputs and a pipeline_id.
        """
        from backend.agents.defect_pipeline import run_defect_pipeline as _run
        return _run(
            bug_description=bug_description,
            bug_id=bug_id,
            team_id=team_id,
            release_date=release_date,
            component=component,
            environment=environment,
            affected_users=affected_users,
            team_members=team_members,
        )

    def get_run(self, run_id: str) -> Optional[Dict]:
        try:
            from sqlmodel import Session
            from backend.database.db import engine
            from backend.models.agent_run import AgentRun
            with Session(engine) as db:
                run = db.get(AgentRun, run_id)
                if not run:
                    return None
                return {
                    "run_id":      run.id,
                    "agent":       run.agent_name,
                    "task_type":   run.task_type,
                    "status":      run.status,
                    "input":       json.loads(run.input_json or "{}"),
                    "output":      json.loads(run.output_json or "{}"),
                    "error":       run.error,
                    "tokens":      run.tokens_used,
                    "latency_ms":  run.latency_ms,
                    "created_at":  run.created_at.isoformat(),
                    "completed_at": run.completed_at.isoformat() if run.completed_at else None,
                }
        except Exception as exc:
            logger.warning("get_run failed: %s", exc)
            return None


def _sse(event: str, data: Dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# Module-level singleton
orchestrator = AgentOrchestrator()
