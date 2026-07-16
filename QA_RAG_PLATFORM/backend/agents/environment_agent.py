"""
EnvironmentAgent — analyses environment-specific failures and flakiness.

Answers: "Is this failure caused by the environment, not the code?"

Input:
  task.query     — error message / test failure description
  task.node_id   — test run id or Jira key (optional)
  task.extra     — {
                     "environment": "staging | qa | prod",
                     "ci_logs": "...",
                     "error_message": "...",
                     "stack_trace": "...",
                     "test_name": "...",
                     "recent_deploys": [...]
                   }

Output schema:
  {
    "is_environment_issue": true,
    "confidence":           0.83,
    "environment_diagnosis": "...",
    "root_environment":     "staging | ci | local | prod",
    "failure_category":     "infra | config | network | data | dependency | code",
    "signals": [
      {"signal": "Redis timeout after deploy", "weight": "high"}
    ],
    "recommended_actions": [
      {"order": 1, "action": "Restart Redis cluster", "owner": "DevOps"}
    ],
    "is_flaky":             false,
    "flakiness_pattern":   "",
    "escalate_to_devops":  true
  }
"""
from __future__ import annotations

from typing import Any, Dict, Tuple

from backend.agents.base_agent import BaseAgent, extract_json
from backend.agents.schemas import AgentTask

_SYSTEM_PROMPT = """\
You are a DevOps and environment reliability expert. Your job is to determine whether
a test failure is caused by an environment issue (infra, config, data, network, dependency)
rather than a code defect.

You are given:
1. FAILURE INFORMATION — error message, stack trace, test name, environment name.
2. CI/CD LOGS — recent log output around the failure point.
3. RECENT DEPLOYS — list of recent deployments that may have changed the environment.
4. RAG CONTEXT — historical environment failures and their resolutions.

Return a JSON object:

  is_environment_issue    — boolean: true if this is primarily an environment problem
  confidence              — 0.0 to 1.0 confidence that this is an environment issue
  environment_diagnosis   — 2-3 sentence summary of what went wrong environmentally
  root_environment        — which environment the failure originates in: staging | ci | local | prod
  failure_category        — primary category: infra | config | network | data | dependency | code
  signals                 — list of {"signal", "weight"} supporting evidence items
                             weight: high | medium | low
  recommended_actions     — ordered list of {"order", "action", "owner"} to resolve the env issue
                             owner: DevOps | QA | Dev | Infra
  is_flaky               — boolean: true if the test passes sometimes (non-deterministic)
  flakiness_pattern      — describe the flakiness pattern if is_flaky is true, else ""
  escalate_to_devops     — boolean: true if the fix requires infrastructure access

Classification rules:
- infra: OOM kills, disk full, pod crashes, container restarts
- config: missing env vars, wrong connection strings, misconfigured services
- network: timeouts, DNS failures, SSL errors, firewall blocks
- data: corrupt test data, stale fixtures, missing seed data
- dependency: third-party service down, version conflict, package missing
- code: logic error in the test or application code (set is_environment_issue=false for this)

Return ONLY valid JSON — no prose, no code fences.
"""


class EnvironmentAgent(BaseAgent):
    name = "environment_agent"
    description = "Determines whether test failures are caused by environment issues vs code defects"

    def build_prompt(
        self,
        task: AgentTask,
        rag_context: str,
        graph_context: str,
    ) -> Tuple[str, str]:
        parts = []
        if task.node_id:
            parts.append(f"TEST/BUG ID: {task.node_id}")
        if task.query:
            parts.append(f"FAILURE DESCRIPTION:\n{task.query}")

        extra = task.extra or {}
        if extra.get("environment"):
            parts.append(f"ENVIRONMENT: {extra['environment']}")
        if extra.get("error_message"):
            parts.append(f"ERROR MESSAGE:\n{extra['error_message']}")
        if extra.get("stack_trace"):
            # Truncate long stack traces
            st = extra["stack_trace"]
            parts.append(f"STACK TRACE:\n{st[:2000]}{'...(truncated)' if len(st) > 2000 else ''}")
        if extra.get("test_name"):
            parts.append(f"TEST NAME: {extra['test_name']}")
        if extra.get("ci_logs"):
            logs = extra["ci_logs"]
            parts.append(f"CI LOGS (last 100 lines):\n{logs[-3000:] if len(logs) > 3000 else logs}")
        if extra.get("recent_deploys"):
            import json
            parts.append(f"RECENT DEPLOYS:\n{json.dumps(extra['recent_deploys'], indent=2)}")

        if rag_context:
            parts.append(f"HISTORICAL ENVIRONMENT FAILURES:\n{rag_context}")

        if not task.query and not extra.get("error_message"):
            parts.append("No failure information provided. Return minimal JSON with confidence: 0.")

        return _SYSTEM_PROMPT, "\n\n".join(parts)

    def parse_output(self, raw: str, task: AgentTask) -> Dict[str, Any]:
        parsed = extract_json(raw)
        if not isinstance(parsed, dict):
            parsed = {}
        parsed.setdefault("is_environment_issue",  False)
        parsed.setdefault("confidence",            0.0)
        parsed.setdefault("environment_diagnosis", "")
        parsed.setdefault("root_environment",      task.extra.get("environment", "unknown"))
        parsed.setdefault("failure_category",      "code")
        parsed.setdefault("signals",               [])
        parsed.setdefault("recommended_actions",   [])
        parsed.setdefault("is_flaky",              False)
        parsed.setdefault("flakiness_pattern",     "")
        parsed.setdefault("escalate_to_devops",    False)
        return parsed
