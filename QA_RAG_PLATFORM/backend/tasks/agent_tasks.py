"""
Celery tasks for AI agent runs.
Long-running agents (RCA, impact analysis) should run in the worker pool
so the API returns a run_id immediately and the client polls for results.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def _task(fn):
    from backend.celery_app import celery_app
    if celery_app:
        return celery_app.task(
            bind=True,
            max_retries=1,
            default_retry_delay=30,
            name=f"backend.tasks.agent_tasks.{fn.__name__}",
        )(fn)
    return fn


@_task
def run_agent_task(self_or_task_dict, task_dict=None, run_id=None):
    """
    Run an agent task asynchronously.
    Args serialized to plain dict for JSON transport.
    """
    from backend.celery_app import celery_app
    if celery_app and task_dict is None:
        actual_dict = self_or_task_dict
    else:
        actual_dict = self_or_task_dict

    _do_run_agent(actual_dict, run_id)


def _do_run_agent(task_dict: dict, run_id: str = None) -> None:
    from backend.agents.orchestrator import orchestrator
    from backend.agents.schemas import AgentTask
    task = AgentTask(**task_dict)
    result = orchestrator.run(task, run_id=run_id)
    logger.info(
        "Celery agent run complete: %s / %s — status=%s tokens=%d",
        result.agent_name, result.run_id, result.status, result.tokens_used,
    )
