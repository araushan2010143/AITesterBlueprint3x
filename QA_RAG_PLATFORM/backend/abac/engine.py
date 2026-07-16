"""
ABAC (Attribute-Based Access Control) engine.

Extends the existing RBAC (admin/user/viewer roles) with resource-level
attribute conditions, enabling team workspace isolation and fine-grained
permission control without changing the existing user model.

Policy evaluation:
  1. Find all policies where subject_role matches user.role (or "*")
  2. Find policies where resource_type matches the requested resource (or "*")
  3. Find policies where action matches (or "*")
  4. Evaluate all conditions — ALL must pass (AND logic)
  5. First matching allow-policy → PERMIT; no match → DENY

Conditions:
  team_id_match  — resource.team_id must equal user.team_id (or resource has no team)
  own_resource   — resource.created_by must equal user.id
  active_only    — resource must have is_active=True
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Resource + Action constants ────────────────────────────────────────────────

RESOURCE_DOCUMENT  = "document"
RESOURCE_CONNECTOR = "connector"
RESOURCE_AGENT_RUN = "agent_run"
RESOURCE_AUDIT     = "audit"
RESOURCE_WEBHOOK   = "webhook"
RESOURCE_GRAPH     = "graph"
RESOURCE_USER      = "user"
RESOURCE_TEAM      = "team"

ACTION_READ   = "read"
ACTION_WRITE  = "write"
ACTION_DELETE = "delete"
ACTION_ADMIN  = "admin"
ACTION_SYNC   = "sync"
ACTION_EXPORT = "export"


@dataclass
class Policy:
    subject_role:  str           # "admin" | "user" | "viewer" | "*"
    resource_type: str           # see RESOURCE_* constants above, or "*"
    action:        str           # see ACTION_* constants above, or "*"
    conditions:    List[str] = field(default_factory=list)  # "team_id_match" | "own_resource"
    effect:        str = "allow"  # "allow" | "deny"  (deny takes precedence in future)


# ── Default policy set ────────────────────────────────────────────────────────

DEFAULT_POLICIES: List[Policy] = [
    # ── Admin — full access ────────────────────────────────────────────────────
    Policy("admin", "*", "*"),

    # ── User — read/write own team resources; no delete; no audit ─────────────
    Policy("user", RESOURCE_DOCUMENT,  ACTION_READ,   ["team_id_match"]),
    Policy("user", RESOURCE_DOCUMENT,  ACTION_WRITE,  ["team_id_match"]),
    Policy("user", RESOURCE_CONNECTOR, ACTION_READ,   ["team_id_match"]),
    Policy("user", RESOURCE_CONNECTOR, ACTION_WRITE,  ["team_id_match"]),
    Policy("user", RESOURCE_CONNECTOR, ACTION_SYNC,   ["team_id_match"]),
    Policy("user", RESOURCE_AGENT_RUN, ACTION_READ,   ["team_id_match"]),
    Policy("user", RESOURCE_AGENT_RUN, ACTION_WRITE,  ["team_id_match"]),
    Policy("user", RESOURCE_WEBHOOK,   ACTION_READ,   ["team_id_match"]),
    Policy("user", RESOURCE_WEBHOOK,   ACTION_WRITE,  ["team_id_match"]),
    Policy("user", RESOURCE_GRAPH,     ACTION_READ,   ["team_id_match"]),

    # ── Viewer — read only, own team ───────────────────────────────────────────
    Policy("viewer", RESOURCE_DOCUMENT,  ACTION_READ, ["team_id_match"]),
    Policy("viewer", RESOURCE_CONNECTOR, ACTION_READ, ["team_id_match"]),
    Policy("viewer", RESOURCE_AGENT_RUN, ACTION_READ, ["team_id_match"]),
    Policy("viewer", RESOURCE_GRAPH,     ACTION_READ, ["team_id_match"]),

    # ── Delete — admin only (explicit deny for non-admin is implicit) ──────────
    # (covered by admin wildcard above)

    # ── Open access for unauthenticated / no team context (dev mode) ──────────
    # When team_id is None on both user and resource, team_id_match passes.
    Policy("user",   RESOURCE_DOCUMENT,  ACTION_WRITE, []),  # allows upload without team
    Policy("viewer", RESOURCE_DOCUMENT,  ACTION_READ,  []),
]


# ── Engine ────────────────────────────────────────────────────────────────────

class ABACEngine:
    def __init__(self, policies: Optional[List[Policy]] = None) -> None:
        self._policies = policies if policies is not None else list(DEFAULT_POLICIES)

    def add_policy(self, policy: Policy) -> None:
        self._policies.append(policy)

    def evaluate(
        self,
        user_role: str,
        user_team_id: Optional[str],
        user_id: Optional[str],
        action: str,
        resource_type: str,
        resource: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Returns True if the action is permitted, False otherwise.

        Args:
            user_role:    Role string from JWT/DB: "admin" | "user" | "viewer"
            user_team_id: User's team_id (None = no team / dev mode)
            user_id:      User's UUID
            action:       The action being requested
            resource_type: The type of resource
            resource:     Optional resource dict with {team_id, created_by, is_active, ...}
        """
        for policy in self._policies:
            if not _matches(policy.subject_role, user_role):
                continue
            if not _matches(policy.resource_type, resource_type):
                continue
            if not _matches(policy.action, action):
                continue
            if _check_conditions(policy.conditions, user_team_id, user_id, resource):
                logger.debug(
                    "ABAC PERMIT: role=%s action=%s resource=%s conditions=%s",
                    user_role, action, resource_type, policy.conditions,
                )
                return True

        logger.debug(
            "ABAC DENY: role=%s action=%s resource=%s", user_role, action, resource_type
        )
        return False

    def check_or_raise(
        self,
        user_role: str,
        user_team_id: Optional[str],
        user_id: Optional[str],
        action: str,
        resource_type: str,
        resource: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Raises HTTPException(403) if not permitted."""
        from fastapi import HTTPException
        if not self.evaluate(user_role, user_team_id, user_id, action, resource_type, resource):
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied: {user_role} cannot {action} {resource_type}",
            )


def _matches(pattern: str, value: str) -> bool:
    return pattern == "*" or pattern == value


def _check_conditions(
    conditions: List[str],
    user_team_id: Optional[str],
    user_id: Optional[str],
    resource: Optional[Dict[str, Any]],
) -> bool:
    for cond in conditions:
        if cond == "team_id_match":
            if user_team_id is None:
                continue  # no team context → pass (dev mode / open access)
            res_team = (resource or {}).get("team_id")
            if res_team and res_team != user_team_id:
                return False
        elif cond == "own_resource":
            res_owner = (resource or {}).get("created_by")
            if res_owner and res_owner != user_id:
                return False
        elif cond == "active_only":
            if (resource or {}).get("is_active") is False:
                return False
    return True


# Module-level singleton
abac = ABACEngine()
