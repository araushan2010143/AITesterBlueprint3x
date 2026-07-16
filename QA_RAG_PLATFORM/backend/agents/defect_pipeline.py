"""
DefectIntelligencePipeline — LangGraph-based multi-agent DAG for enterprise defect analysis.

Pipeline flow:
  Bug Input
      │
      ▼
   RCA Agent  ──────────────────────────────────────────┐
      │                                                  │
      ▼                                                  │
  Impact Agent                                          │
      │                                                  │
      ▼                                                  │
  Severity Prediction Agent ◄── (uses rca + impact)    │
      │                                                  │
      ▼                                                  │
  Assignment Agent ◄── (uses severity + rca)            │
      │                                                  │
      ▼                                                  │
  Regression Recommendation Agent ◄── (uses impact)    │
      │                                                  │
      ▼                                                  │
  Release Risk Agent ◄── (synthesizes all outputs)  ◄──┘
      │
      ▼
  PipelineResult

Usage:
  from backend.agents.defect_pipeline import run_defect_pipeline
  result = run_defect_pipeline(
      bug_description="Login fails on Safari when 2FA is enabled",
      bug_id="KAN-42",
      team_id="team-abc",
      release_date="2026-07-20",
  )
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional, TypedDict

logger = logging.getLogger(__name__)


# ── LangGraph State ────────────────────────────────────────────────────────────

class DefectState(TypedDict, total=False):
    """Typed state bag passed between pipeline nodes."""
    # Inputs
    bug_description: str
    bug_id: str
    team_id: str
    release_date: str
    component: str
    environment: str
    affected_users: int
    team_members: List[Dict[str, Any]]
    # Agent outputs (filled in as pipeline progresses)
    rca_output: Dict[str, Any]
    impact_output: Dict[str, Any]
    severity_output: Dict[str, Any]
    assignment_output: Dict[str, Any]
    regression_output: Dict[str, Any]
    release_risk_output: Dict[str, Any]
    # Error tracking
    errors: List[str]


# ── Node functions ─────────────────────────────────────────────────────────────

def _run_rca(state: DefectState) -> DefectState:
    """Node 1: Root Cause Analysis."""
    try:
        from backend.agents.rca_agent import RCAAgent
        from backend.agents.schemas import AgentTask
        agent = RCAAgent()
        task = AgentTask(
            task_type="rca",
            query=state.get("bug_description", ""),
            node_id=state.get("bug_id"),
            node_type="Bug",
            team_id=state.get("team_id"),
        )
        result = agent.run(task)
        state["rca_output"] = result.output if result.status == "done" else {}
        if result.status != "done":
            errors = list(state.get("errors") or [])
            errors.append(f"RCA failed: {result.error}")
            state["errors"] = errors
    except Exception as exc:
        logger.warning("DefectPipeline RCA node error: %s", exc)
        errors = list(state.get("errors") or [])
        errors.append(f"RCA node exception: {exc}")
        state["errors"] = errors
        state["rca_output"] = {}
    return state


def _run_impact(state: DefectState) -> DefectState:
    """Node 2: Impact Analysis."""
    try:
        from backend.agents.impact_agent import ImpactAgent
        from backend.agents.schemas import AgentTask
        agent = ImpactAgent()
        task = AgentTask(
            task_type="impact_analysis",
            query=state.get("bug_description", ""),
            node_id=state.get("bug_id"),
            node_type="Bug",
            team_id=state.get("team_id"),
            extra={"rca_output": state.get("rca_output", {})},
        )
        result = agent.run(task)
        state["impact_output"] = result.output if result.status == "done" else {}
        if result.status != "done":
            errors = list(state.get("errors") or [])
            errors.append(f"Impact failed: {result.error}")
            state["errors"] = errors
    except Exception as exc:
        logger.warning("DefectPipeline Impact node error: %s", exc)
        errors = list(state.get("errors") or [])
        errors.append(f"Impact node exception: {exc}")
        state["errors"] = errors
        state["impact_output"] = {}
    return state


def _run_severity(state: DefectState) -> DefectState:
    """Node 3: Severity Prediction."""
    try:
        from backend.agents.severity_prediction_agent import SeverityPredictionAgent
        from backend.agents.schemas import AgentTask
        agent = SeverityPredictionAgent()
        impact = state.get("impact_output", {})
        task = AgentTask(
            task_type="severity_prediction",
            query=state.get("bug_description", ""),
            node_id=state.get("bug_id"),
            team_id=state.get("team_id"),
            extra={
                "component":      state.get("component") or impact.get("affected_area", ""),
                "environment":    state.get("environment", ""),
                "affected_users": state.get("affected_users", 0),
                "rca_output":     state.get("rca_output", {}),
            },
        )
        result = agent.run(task)
        state["severity_output"] = result.output if result.status == "done" else {}
        if result.status != "done":
            errors = list(state.get("errors") or [])
            errors.append(f"Severity failed: {result.error}")
            state["errors"] = errors
    except Exception as exc:
        logger.warning("DefectPipeline Severity node error: %s", exc)
        errors = list(state.get("errors") or [])
        errors.append(f"Severity node exception: {exc}")
        state["errors"] = errors
        state["severity_output"] = {}
    return state


def _run_assignment(state: DefectState) -> DefectState:
    """Node 4: Assignment Recommendation."""
    try:
        from backend.agents.assignment_agent import AssignmentAgent
        from backend.agents.schemas import AgentTask
        agent = AssignmentAgent()
        severity_out = state.get("severity_output", {})
        impact = state.get("impact_output", {})
        task = AgentTask(
            task_type="assignment",
            query=state.get("bug_description", ""),
            node_id=state.get("bug_id"),
            team_id=state.get("team_id"),
            extra={
                "severity":     severity_out.get("predicted_severity", "medium"),
                "component":    state.get("component") or impact.get("affected_area", ""),
                "rca_output":   state.get("rca_output", {}),
                "team_members": state.get("team_members", []),
            },
        )
        result = agent.run(task)
        state["assignment_output"] = result.output if result.status == "done" else {}
        if result.status != "done":
            errors = list(state.get("errors") or [])
            errors.append(f"Assignment failed: {result.error}")
            state["errors"] = errors
    except Exception as exc:
        logger.warning("DefectPipeline Assignment node error: %s", exc)
        errors = list(state.get("errors") or [])
        errors.append(f"Assignment node exception: {exc}")
        state["errors"] = errors
        state["assignment_output"] = {}
    return state


def _run_regression(state: DefectState) -> DefectState:
    """Node 5: Regression Recommendation."""
    try:
        from backend.agents.regression_recommendation_agent import RegressionRecommendationAgent
        from backend.agents.schemas import AgentTask
        agent = RegressionRecommendationAgent()
        impact = state.get("impact_output", {})
        task = AgentTask(
            task_type="regression_recommendation",
            query=state.get("bug_description", ""),
            node_id=state.get("bug_id"),
            node_type="Bug",
            team_id=state.get("team_id"),
            extra={
                "affected_area":   impact.get("affected_area", state.get("component", "")),
                "affected_layers": impact.get("affected_layers", []),
                "impact_output":   impact,
                "rca_output":      state.get("rca_output", {}),
            },
        )
        result = agent.run(task)
        state["regression_output"] = result.output if result.status == "done" else {}
        if result.status != "done":
            errors = list(state.get("errors") or [])
            errors.append(f"Regression failed: {result.error}")
            state["errors"] = errors
    except Exception as exc:
        logger.warning("DefectPipeline Regression node error: %s", exc)
        errors = list(state.get("errors") or [])
        errors.append(f"Regression node exception: {exc}")
        state["errors"] = errors
        state["regression_output"] = {}
    return state


def _run_release_risk(state: DefectState) -> DefectState:
    """Node 6: Release Risk Assessment."""
    try:
        from backend.agents.release_risk_agent import ReleaseRiskAgent
        from backend.agents.schemas import AgentTask
        agent = ReleaseRiskAgent()
        severity_out = state.get("severity_output", {})
        impact = state.get("impact_output", {})

        task = AgentTask(
            task_type="release_risk",
            query=f"Release assessment for bug {state.get('bug_id', '')}",
            team_id=state.get("team_id"),
            extra={
                "release_date":       state.get("release_date", ""),
                "open_critical_bugs": 1 if severity_out.get("predicted_severity") == "critical" else 0,
                "open_high_bugs":     1 if severity_out.get("predicted_severity") == "high" else 0,
                "rca_summaries":      [state.get("rca_output", {})],
                "regression_output":  state.get("regression_output", {}),
                "severity_output":    severity_out,
            },
        )
        result = agent.run(task)
        state["release_risk_output"] = result.output if result.status == "done" else {}
        if result.status != "done":
            errors = list(state.get("errors") or [])
            errors.append(f"ReleaseRisk failed: {result.error}")
            state["errors"] = errors
    except Exception as exc:
        logger.warning("DefectPipeline ReleaseRisk node error: %s", exc)
        errors = list(state.get("errors") or [])
        errors.append(f"ReleaseRisk node exception: {exc}")
        state["errors"] = errors
        state["release_risk_output"] = {}
    return state


# ── Graph construction ─────────────────────────────────────────────────────────

def _build_graph():
    """Build and compile the LangGraph StateGraph for defect intelligence."""
    from langgraph.graph import StateGraph, END

    graph = StateGraph(DefectState)

    graph.add_node("rca",        _run_rca)
    graph.add_node("impact",     _run_impact)
    graph.add_node("severity",   _run_severity)
    graph.add_node("assignment", _run_assignment)
    graph.add_node("regression", _run_regression)
    graph.add_node("release_risk", _run_release_risk)

    # Linear DAG: rca → impact → severity → assignment → regression → release_risk
    graph.set_entry_point("rca")
    graph.add_edge("rca",        "impact")
    graph.add_edge("impact",     "severity")
    graph.add_edge("severity",   "assignment")
    graph.add_edge("assignment", "regression")
    graph.add_edge("regression", "release_risk")
    graph.add_edge("release_risk", END)

    return graph.compile()


# Module-level compiled graph (lazy-initialized to avoid import-time LangGraph cost)
_compiled_graph = None


def _get_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = _build_graph()
    return _compiled_graph


# ── Public API ─────────────────────────────────────────────────────────────────

def run_defect_pipeline(
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
    Run the full defect intelligence pipeline.

    Returns a dict with all 6 agent outputs plus a pipeline_id.
    """
    pipeline_id = str(uuid.uuid4())
    logger.info("Starting DefectIntelligencePipeline: %s (bug=%s)", pipeline_id, bug_id)

    initial_state: DefectState = {
        "bug_description": bug_description,
        "bug_id":          bug_id,
        "team_id":         team_id or "",
        "release_date":    release_date,
        "component":       component,
        "environment":     environment,
        "affected_users":  affected_users,
        "team_members":    team_members or [],
        "errors":          [],
    }

    try:
        graph = _get_graph()
        final_state = graph.invoke(initial_state)
    except Exception as exc:
        logger.exception("DefectIntelligencePipeline failed: %s", exc)
        final_state = dict(initial_state)
        final_state["errors"] = [f"Pipeline execution error: {exc}"]

    errors = final_state.get("errors") or []
    return {
        "pipeline_id":       pipeline_id,
        "bug_id":            bug_id,
        "status":            "partial" if errors else "done",
        "errors":            errors,
        "rca":               final_state.get("rca_output", {}),
        "impact":            final_state.get("impact_output", {}),
        "severity":          final_state.get("severity_output", {}),
        "assignment":        final_state.get("assignment_output", {}),
        "regression":        final_state.get("regression_output", {}),
        "release_risk":      final_state.get("release_risk_output", {}),
    }
