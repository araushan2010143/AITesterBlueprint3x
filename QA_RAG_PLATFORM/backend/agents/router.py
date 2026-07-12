"""Master router — dispatches AI actions to specialized agents."""
from typing import Any, Dict
from backend.agents import (
    test_case_agent, duplicate_agent, coverage_agent, report_agent
)

ACTION_MAP = {
    "generate_test_cases": test_case_agent.run,
    "find_duplicates": duplicate_agent.run,
    "coverage_analysis": coverage_agent.run,
    "rca": report_agent.run_rca,
    "release_summary": report_agent.run_release_summary,
    "explain_failure": report_agent.run_explain_failure,
    "automate": report_agent.run_automate,
    "generate_script": report_agent.run_generate_script,
    "test_data": report_agent.run_test_data,
}

SUPPORTED_ACTIONS = list(ACTION_MAP.keys())


def dispatch(action: str, content: str, options: Dict[str, Any] = {}) -> Dict[str, Any]:
    handler = ACTION_MAP.get(action)
    if handler is None:
        raise ValueError(f"Unknown action '{action}'. Supported: {SUPPORTED_ACTIONS}")
    return handler(content, options)
