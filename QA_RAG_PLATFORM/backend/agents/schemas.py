"""Shared Pydantic schemas for all agents."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class AgentTask(BaseModel):
    """Input to any agent via the orchestrator."""
    task_type: str                              # requirement_analysis | story_generation | impact_analysis | rca
    # Primary input — at least one of these should be set
    query: str = ""                             # free-text question or description
    doc_id: Optional[str] = None               # RAG document to ground on
    node_id: Optional[str] = None              # graph node id (story_id, req_id, bug_id, etc.)
    node_type: Optional[str] = None            # Story | Requirement | Bug | Feature | Module
    items: Optional[List[Dict[str, Any]]] = None  # e.g. list of requirements for story generation
    # Context controls
    top_k: int = 5                             # RAG retrieval top-k
    team_id: Optional[str] = None
    created_by: Optional[str] = None
    extra: Dict[str, Any] = {}                 # agent-specific extra params
    # Multi-turn memory
    session_id: Optional[str] = None           # pass the same session_id across turns for memory
    conversation_history: List[Dict[str, Any]] = []  # injected by BaseAgent from DB; callers leave empty


class Citation(BaseModel):
    chunk_id: str = ""
    doc_id: str = ""
    filename: str = ""
    excerpt: str = ""
    score: float = 0.0


class AgentResult(BaseModel):
    """Structured output from every agent."""
    run_id: str
    agent_name: str
    task_type: str
    status: str                                 # done | failed
    output: Dict[str, Any] = {}
    citations: List[Citation] = []
    tokens_used: int = 0
    latency_ms: int = 0
    error: Optional[str] = None


# ── Task type constants ────────────────────────────────────────────────────────
TASK_REQUIREMENT_ANALYSIS      = "requirement_analysis"
TASK_STORY_GENERATION          = "story_generation"
TASK_IMPACT_ANALYSIS           = "impact_analysis"
TASK_RCA                       = "rca"
TASK_FACT_CHECK                = "fact_check"
TASK_SEVERITY_PREDICTION       = "severity_prediction"
TASK_ASSIGNMENT                = "assignment"
TASK_REGRESSION_RECOMMENDATION = "regression_recommendation"
TASK_ENVIRONMENT_ANALYSIS      = "environment_analysis"
TASK_RELEASE_RISK              = "release_risk"
TASK_CODE_CHANGE               = "code_change"
TASK_LOG_ANALYSIS              = "log_analysis"
TASK_SCREENSHOT_ANALYSIS       = "screenshot_analysis"
