"""
Multi-Agent Orchestrator REST + SSE API.

Endpoints:
  GET  /api/agents                          — list registered agents
  POST /api/agents/run                      — run agent synchronously, return result
  POST /api/agents/stream                   — run agent with SSE streaming
  POST /api/agents/pipeline                 — run a chained sequence of agents
  GET  /api/agents/history                  — list recent agent runs
  GET  /api/agents/runs/{run_id}            — get full run detail + output

Convenience shortcuts:
  POST /api/agents/requirement-analysis     — extract requirements from text/doc
  POST /api/agents/story-generation         — generate stories from requirements
  POST /api/agents/impact-analysis          — analyse impact of a node change
  POST /api/agents/rca                      — root cause analysis for a bug
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session

from backend.agents.orchestrator import orchestrator
from backend.agents.schemas import AgentTask
from backend.database.db import get_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agents", tags=["AI Agents"])


# ── Request schema ─────────────────────────────────────────────────────────────

class RunRequest(BaseModel):
    task_type: str
    query: str = ""
    doc_id: Optional[str] = None
    node_id: Optional[str] = None
    node_type: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = None
    top_k: int = 5
    team_id: Optional[str] = None
    created_by: Optional[str] = None
    extra: Dict[str, Any] = {}


class PipelineRequest(BaseModel):
    tasks: List[RunRequest]


class DefectPipelineRequest(BaseModel):
    bug_description: str
    bug_id: str = ""
    team_id: Optional[str] = None
    release_date: str = ""
    component: str = ""
    environment: str = ""
    affected_users: int = 0
    team_members: List[Dict[str, Any]] = []


class ReviewRequest(BaseModel):
    verdict: str                               # accept | modify | reject
    feedback: Optional[str] = None            # free-text reason or correction
    corrected_output: Optional[Dict[str, Any]] = None  # modified output if verdict=modify
    reviewed_by: Optional[str] = None
    team_id: Optional[str] = None


# ── Registry ──────────────────────────────────────────────────────────────────

@router.get("")
def list_agents():
    return {
        "agents": orchestrator.list_agents(),
        "count": len(orchestrator.list_agents()),
    }


# ── Synchronous run ───────────────────────────────────────────────────────────

@router.post("/run")
def run_agent(req: RunRequest, session: Session = Depends(get_session)):
    task = AgentTask(**req.model_dump())
    result = orchestrator.run(task)
    return result.model_dump()


# ── SSE streaming run ─────────────────────────────────────────────────────────

@router.post("/stream")
async def stream_agent(req: RunRequest):
    task = AgentTask(**req.model_dump())
    return StreamingResponse(
        orchestrator.stream_events(task),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Pipeline ──────────────────────────────────────────────────────────────────

@router.post("/pipeline")
def run_pipeline(req: PipelineRequest, session: Session = Depends(get_session)):
    if not req.tasks:
        raise HTTPException(400, "Pipeline must have at least one task")
    tasks = [AgentTask(**t.model_dump()) for t in req.tasks]
    results = orchestrator.run_pipeline(tasks)
    return {
        "results": [r.model_dump() for r in results],
        "total_tasks": len(results),
        "succeeded": sum(1 for r in results if r.status == "done"),
        "failed": sum(1 for r in results if r.status == "failed"),
    }


# ── History ───────────────────────────────────────────────────────────────────

@router.get("/history")
def agent_history(
    team_id: Optional[str] = Query(None),
    agent_name: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
):
    return {"runs": orchestrator.run_history(team_id=team_id, agent_name=agent_name, limit=limit)}


@router.get("/runs/{run_id}")
def get_run(run_id: str):
    run = orchestrator.get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return run


# ── Human approval workflow ───────────────────────────────────────────────────

@router.post("/runs/{run_id}/review")
def submit_review(run_id: str, req: ReviewRequest, session: Session = Depends(get_session)):
    """
    Submit a human review of an agent recommendation.

    verdict:
      accept  — AI output is correct, approved for action
      modify  — AI output is partially correct; corrected_output contains the fixed version
      reject  — AI output is wrong or not actionable

    The review is persisted and the agent run's status is updated accordingly.
    Reviews feed back into the system as training signal for future runs.

    Body example:
      {
        "verdict": "modify",
        "feedback": "Severity should be 'critical' — this affects all prod users",
        "corrected_output": {"predicted_severity": "critical", ...},
        "reviewed_by": "qa-lead@example.com",
        "team_id": "team-abc"
      }
    """
    import json as _json
    from backend.models.agent_run import AgentRun
    from backend.models.agent_review import AgentReview

    VALID_VERDICTS = {"accept", "modify", "reject"}
    if req.verdict not in VALID_VERDICTS:
        raise HTTPException(400, f"verdict must be one of: {', '.join(VALID_VERDICTS)}")

    # Verify the run exists
    run = session.get(AgentRun, run_id)
    if not run:
        raise HTTPException(404, f"Agent run '{run_id}' not found")

    # Persist the review
    review = AgentReview(
        run_id=run_id,
        agent_name=run.agent_name,
        task_type=run.task_type,
        verdict=req.verdict,
        feedback=req.feedback,
        corrected_output=_json.dumps(req.corrected_output) if req.corrected_output else None,
        team_id=req.team_id or run.team_id,
        reviewed_by=req.reviewed_by,
    )
    session.add(review)
    session.commit()
    session.refresh(review)

    return {
        "review_id":  review.id,
        "run_id":     run_id,
        "verdict":    req.verdict,
        "agent":      run.agent_name,
        "task_type":  run.task_type,
        "message":    f"Review recorded. Verdict: {req.verdict}.",
    }


@router.get("/runs/{run_id}/review")
def get_review(run_id: str, session: Session = Depends(get_session)):
    """Get the human review for an agent run, if one exists."""
    import json as _json
    from sqlmodel import select
    from backend.models.agent_review import AgentReview

    review = session.exec(
        select(AgentReview).where(AgentReview.run_id == run_id)
        .order_by(AgentReview.created_at.desc())
    ).first()

    if not review:
        raise HTTPException(404, "No review found for this run")

    return {
        "review_id":        review.id,
        "run_id":           review.run_id,
        "agent_name":       review.agent_name,
        "task_type":        review.task_type,
        "verdict":          review.verdict,
        "feedback":         review.feedback,
        "corrected_output": _json.loads(review.corrected_output) if review.corrected_output else None,
        "reviewed_by":      review.reviewed_by,
        "team_id":          review.team_id,
        "created_at":       review.created_at.isoformat(),
    }


@router.get("/reviews")
def list_reviews(
    team_id: Optional[str] = Query(None),
    verdict: Optional[str] = Query(None),
    agent_name: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    session: Session = Depends(get_session),
):
    """
    List human reviews — useful for measuring acceptance rate and finding
    patterns in AI errors.

    Filter by team_id, verdict (accept|modify|reject), or agent_name.
    """
    import json as _json
    from sqlmodel import select
    from backend.models.agent_review import AgentReview

    stmt = select(AgentReview).order_by(AgentReview.created_at.desc()).limit(limit)
    if team_id:
        stmt = stmt.where(AgentReview.team_id == team_id)
    if verdict:
        stmt = stmt.where(AgentReview.verdict == verdict)
    if agent_name:
        stmt = stmt.where(AgentReview.agent_name == agent_name)

    reviews = session.exec(stmt).all()
    return {
        "reviews": [
            {
                "review_id":  r.id,
                "run_id":     r.run_id,
                "agent":      r.agent_name,
                "task_type":  r.task_type,
                "verdict":    r.verdict,
                "feedback":   r.feedback,
                "reviewed_by": r.reviewed_by,
                "created_at": r.created_at.isoformat(),
            }
            for r in reviews
        ],
        "total": len(reviews),
        "acceptance_rate": round(
            sum(1 for r in reviews if r.verdict == "accept") / len(reviews), 2
        ) if reviews else 0.0,
    }


# ── Convenience shortcuts ─────────────────────────────────────────────────────

@router.post("/requirement-analysis")
def requirement_analysis(req: RunRequest, session: Session = Depends(get_session)):
    req.task_type = "requirement_analysis"
    return run_agent(req, session)


@router.post("/story-generation")
def story_generation(req: RunRequest, session: Session = Depends(get_session)):
    req.task_type = "story_generation"
    return run_agent(req, session)


@router.post("/impact-analysis")
def impact_analysis(req: RunRequest, session: Session = Depends(get_session)):
    req.task_type = "impact_analysis"
    return run_agent(req, session)


@router.post("/rca")
def rca(req: RunRequest, session: Session = Depends(get_session)):
    req.task_type = "rca"
    return run_agent(req, session)


# ── End-to-end: text → requirements → stories ─────────────────────────────────

@router.post("/fact-check")
def fact_check(req: RunRequest, session: Session = Depends(get_session)):
    """
    Verify factual claims in an AI answer against source citations.

    Pass the answer as `query` and the citations list in `extra.citations`:
      {
        "query": "<the AI answer text>",
        "extra": {
          "citations": [
            {"filename": "spec.pdf", "excerpt": "..."}
          ]
        }
      }
    """
    req.task_type = "fact_check"
    return run_agent(req, session)


@router.post("/severity-prediction")
def severity_prediction(req: RunRequest, session: Session = Depends(get_session)):
    """Predict bug severity from description using historical patterns."""
    req.task_type = "severity_prediction"
    return run_agent(req, session)


@router.post("/assignment")
def assignment(req: RunRequest, session: Session = Depends(get_session)):
    """Recommend the optimal engineer to assign a bug to."""
    req.task_type = "assignment"
    return run_agent(req, session)


@router.post("/regression-recommendation")
def regression_recommendation(req: RunRequest, session: Session = Depends(get_session)):
    """Recommend regression test suites to run for a bug fix."""
    req.task_type = "regression_recommendation"
    return run_agent(req, session)


@router.post("/environment-analysis")
def environment_analysis(req: RunRequest, session: Session = Depends(get_session)):
    """Determine if a test failure is an environment issue vs. a code defect."""
    req.task_type = "environment_analysis"
    return run_agent(req, session)


@router.post("/release-risk")
def release_risk(req: RunRequest, session: Session = Depends(get_session)):
    """Assess release readiness and produce a go/no-go recommendation."""
    req.task_type = "release_risk"
    return run_agent(req, session)


@router.post("/defect-pipeline")
def defect_pipeline(req: DefectPipelineRequest):
    """
    Run the full 6-stage LangGraph Defect Intelligence Pipeline for a single bug.

    Stages (in order):
      1. RCA            — root cause analysis
      2. Impact         — downstream component impact
      3. Severity       — severity prediction (Critical/High/Medium/Low)
      4. Assignment     — recommended engineer
      5. Regression     — test suites to run before releasing the fix
      6. Release Risk   — go/no-go recommendation

    Returns all 6 stage outputs in a single response with a pipeline_id for tracking.
    """
    result = orchestrator.run_defect_pipeline(
        bug_description=req.bug_description,
        bug_id=req.bug_id,
        team_id=req.team_id,
        release_date=req.release_date,
        component=req.component,
        environment=req.environment,
        affected_users=req.affected_users,
        team_members=req.team_members,
    )
    return result


@router.post("/code-change")
def code_change(req: RunRequest, session: Session = Depends(get_session)):
    """
    Analyse a git commit diff or PR for defect correlation and regression risk.

    Pass the diff in extra.diff_text, or let the agent fetch it via
    extra.github_token + extra.repo + extra.commit_sha (or extra.pr_number).

    extra.mode controls the analysis:
      bug_correlation — does this diff likely introduce the bug in task.query?
      risk_review     — what regression risk does this diff carry?
      defect_intro    — find potential defects hidden in the diff
    """
    req.task_type = "code_change"
    return run_agent(req, session)


@router.post("/log-analysis")
def log_analysis(req: RunRequest, session: Session = Depends(get_session)):
    """
    Parse CI/application logs to extract error patterns and map to known defects.

    Pass raw log text in task.query or extra.log_text.
    Set extra.log_source to: github_actions | cloudwatch | datadog | plain
    """
    req.task_type = "log_analysis"
    return run_agent(req, session)


@router.post("/screenshot-analysis")
def screenshot_analysis(req: RunRequest, session: Session = Depends(get_session)):
    """
    Analyse a UI screenshot for visual defects using GPT-4o or Claude vision.

    Pass the image as extra.image_base64 (base64-encoded PNG/JPEG) or extra.image_url.
    Falls back to text-only analysis if no vision API key is configured.

    Required extra fields:
      image_base64 or image_url  — the screenshot to analyse
    Optional:
      image_format  — png | jpeg | webp (default: png)
      screen_name   — "Login Page"
      browser       — "Safari 17"
      os            — "macOS 15"
      viewport      — "1440x900"
    """
    req.task_type = "screenshot_analysis"
    return run_agent(req, session)


@router.post("/generate-stories-from-text")
def generate_stories_from_text(
    req: RunRequest,
    session: Session = Depends(get_session),
):
    """
    Single-call pipeline: extract requirements from text, then generate stories.
    Equivalent to POST /pipeline with [requirement_analysis, story_generation].
    """
    tasks = [
        AgentTask(task_type="requirement_analysis", query=req.query,
                  doc_id=req.doc_id, team_id=req.team_id, created_by=req.created_by,
                  top_k=req.top_k),
        AgentTask(task_type="story_generation", team_id=req.team_id,
                  created_by=req.created_by),
    ]
    results = orchestrator.run_pipeline(tasks)
    return {
        "requirements": results[0].output if results else {},
        "stories":      results[1].output if len(results) > 1 else {},
        "run_ids":      [r.run_id for r in results],
        "tokens_used":  sum(r.tokens_used for r in results),
    }
