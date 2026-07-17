"""Unit tests — ABAC (Attribute-Based Access Control) engine."""
import pytest
from fastapi import HTTPException
from backend.abac.engine import (
    ABACEngine,
    Policy,
    DEFAULT_POLICIES,
    RESOURCE_DOCUMENT,
    RESOURCE_CONNECTOR,
    RESOURCE_AGENT_RUN,
    RESOURCE_AUDIT,
    RESOURCE_WEBHOOK,
    RESOURCE_GRAPH,
    RESOURCE_USER,
    RESOURCE_TEAM,
    ACTION_READ,
    ACTION_WRITE,
    ACTION_DELETE,
    ACTION_ADMIN,
    ACTION_SYNC,
    ACTION_EXPORT,
)


def engine() -> ABACEngine:
    """Fresh engine with default policies for each test."""
    return ABACEngine()


# ── Admin wildcard ────────────────────────────────────────────────────────────

class TestAdminRole:

    def test_admin_can_read_any_resource(self):
        assert engine().evaluate("admin", None, None, ACTION_READ, RESOURCE_DOCUMENT)

    def test_admin_can_write_any_resource(self):
        assert engine().evaluate("admin", None, None, ACTION_WRITE, RESOURCE_CONNECTOR)

    def test_admin_can_delete_document(self):
        assert engine().evaluate("admin", None, None, ACTION_DELETE, RESOURCE_DOCUMENT)

    def test_admin_can_admin_users(self):
        assert engine().evaluate("admin", None, None, ACTION_ADMIN, RESOURCE_USER)

    def test_admin_can_export_audit(self):
        assert engine().evaluate("admin", None, None, ACTION_EXPORT, RESOURCE_AUDIT)

    def test_admin_with_team_id_still_permitted(self):
        assert engine().evaluate("admin", "team-a", "user-1", ACTION_DELETE, RESOURCE_DOCUMENT,
                                  resource={"team_id": "team-b"})

    def test_admin_can_sync_connector(self):
        assert engine().evaluate("admin", None, None, ACTION_SYNC, RESOURCE_CONNECTOR)


# ── User role ─────────────────────────────────────────────────────────────────

class TestUserRole:

    def test_user_can_read_own_team_document(self):
        assert engine().evaluate(
            "user", "team-1", "user-1", ACTION_READ, RESOURCE_DOCUMENT,
            resource={"team_id": "team-1"},
        )

    def test_user_cannot_read_other_team_document(self):
        assert not engine().evaluate(
            "user", "team-1", "user-1", ACTION_READ, RESOURCE_DOCUMENT,
            resource={"team_id": "team-2"},
        )

    def test_user_can_write_own_team_document(self):
        assert engine().evaluate(
            "user", "team-1", "user-1", ACTION_WRITE, RESOURCE_DOCUMENT,
            resource={"team_id": "team-1"},
        )

    def test_user_cannot_delete_document(self):
        assert not engine().evaluate(
            "user", "team-1", "user-1", ACTION_DELETE, RESOURCE_DOCUMENT,
            resource={"team_id": "team-1"},
        )

    def test_user_can_read_connector_same_team(self):
        assert engine().evaluate(
            "user", "team-1", "user-1", ACTION_READ, RESOURCE_CONNECTOR,
            resource={"team_id": "team-1"},
        )

    def test_user_cannot_read_audit_log(self):
        assert not engine().evaluate(
            "user", "team-1", "user-1", ACTION_READ, RESOURCE_AUDIT,
        )

    def test_user_can_read_graph_same_team(self):
        assert engine().evaluate(
            "user", "team-1", "user-1", ACTION_READ, RESOURCE_GRAPH,
            resource={"team_id": "team-1"},
        )

    def test_user_no_team_id_can_write_document(self):
        # No team context → dev/open mode
        assert engine().evaluate("user", None, None, ACTION_WRITE, RESOURCE_DOCUMENT)

    def test_user_can_sync_connector_same_team(self):
        assert engine().evaluate(
            "user", "team-1", "user-1", ACTION_SYNC, RESOURCE_CONNECTOR,
            resource={"team_id": "team-1"},
        )

    def test_user_cannot_admin_resource(self):
        assert not engine().evaluate(
            "user", "team-1", "user-1", ACTION_ADMIN, RESOURCE_DOCUMENT,
        )


# ── Viewer role ───────────────────────────────────────────────────────────────

class TestViewerRole:

    def test_viewer_can_read_document_same_team(self):
        assert engine().evaluate(
            "viewer", "team-1", "user-v", ACTION_READ, RESOURCE_DOCUMENT,
            resource={"team_id": "team-1"},
        )

    def test_viewer_cannot_read_document_other_team(self):
        assert not engine().evaluate(
            "viewer", "team-1", "user-v", ACTION_READ, RESOURCE_DOCUMENT,
            resource={"team_id": "team-2"},
        )

    def test_viewer_cannot_write_document(self):
        assert not engine().evaluate(
            "viewer", "team-1", "user-v", ACTION_WRITE, RESOURCE_DOCUMENT,
            resource={"team_id": "team-1"},
        )

    def test_viewer_cannot_delete_document(self):
        assert not engine().evaluate(
            "viewer", "team-1", "user-v", ACTION_DELETE, RESOURCE_DOCUMENT,
        )

    def test_viewer_can_read_connector_same_team(self):
        assert engine().evaluate(
            "viewer", "team-1", "user-v", ACTION_READ, RESOURCE_CONNECTOR,
            resource={"team_id": "team-1"},
        )

    def test_viewer_can_read_agent_run_same_team(self):
        assert engine().evaluate(
            "viewer", "team-1", "user-v", ACTION_READ, RESOURCE_AGENT_RUN,
            resource={"team_id": "team-1"},
        )

    def test_viewer_cannot_write_agent_run(self):
        assert not engine().evaluate(
            "viewer", "team-1", "user-v", ACTION_WRITE, RESOURCE_AGENT_RUN,
        )

    def test_viewer_cannot_sync_connector(self):
        assert not engine().evaluate(
            "viewer", "team-1", "user-v", ACTION_SYNC, RESOURCE_CONNECTOR,
        )


# ── Unknown/invalid roles ─────────────────────────────────────────────────────

class TestUnknownRole:

    def test_unknown_role_denied_everywhere(self):
        assert not engine().evaluate("superuser", None, None, ACTION_READ, RESOURCE_DOCUMENT)

    def test_empty_role_denied(self):
        assert not engine().evaluate("", None, None, ACTION_READ, RESOURCE_DOCUMENT)


# ── team_id_match condition ───────────────────────────────────────────────────

class TestTeamIdMatchCondition:

    def test_no_team_id_on_resource_passes(self):
        # Resource has no team_id → any team user can access
        assert engine().evaluate(
            "user", "team-x", "user-1", ACTION_READ, RESOURCE_DOCUMENT,
            resource={"filename": "test.pdf"},  # no team_id
        )

    def test_user_no_team_id_passes_team_match(self):
        # User has no team (dev mode) → team_id_match is skipped
        assert engine().evaluate(
            "user", None, "user-1", ACTION_READ, RESOURCE_DOCUMENT,
            resource={"team_id": "team-x"},
        )

    def test_team_id_mismatch_denied(self):
        assert not engine().evaluate(
            "user", "team-a", "user-1", ACTION_READ, RESOURCE_DOCUMENT,
            resource={"team_id": "team-b"},
        )


# ── own_resource condition ────────────────────────────────────────────────────

class TestOwnResourceCondition:

    def test_own_resource_allows_owner(self):
        e = ABACEngine([
            Policy("user", RESOURCE_DOCUMENT, ACTION_DELETE, ["own_resource"]),
        ])
        assert e.evaluate(
            "user", None, "user-1", ACTION_DELETE, RESOURCE_DOCUMENT,
            resource={"created_by": "user-1"},
        )

    def test_own_resource_denies_non_owner(self):
        e = ABACEngine([
            Policy("user", RESOURCE_DOCUMENT, ACTION_DELETE, ["own_resource"]),
        ])
        assert not e.evaluate(
            "user", None, "user-1", ACTION_DELETE, RESOURCE_DOCUMENT,
            resource={"created_by": "user-2"},
        )

    def test_own_resource_no_created_by_passes(self):
        e = ABACEngine([
            Policy("user", RESOURCE_DOCUMENT, ACTION_DELETE, ["own_resource"]),
        ])
        # Resource has no created_by → condition passes
        assert e.evaluate(
            "user", None, "user-1", ACTION_DELETE, RESOURCE_DOCUMENT,
            resource={"team_id": "team-1"},
        )


# ── active_only condition ─────────────────────────────────────────────────────

class TestActiveOnlyCondition:

    def test_active_resource_allowed(self):
        e = ABACEngine([
            Policy("user", RESOURCE_DOCUMENT, ACTION_READ, ["active_only"]),
        ])
        assert e.evaluate(
            "user", None, "user-1", ACTION_READ, RESOURCE_DOCUMENT,
            resource={"is_active": True},
        )

    def test_inactive_resource_denied(self):
        e = ABACEngine([
            Policy("user", RESOURCE_DOCUMENT, ACTION_READ, ["active_only"]),
        ])
        assert not e.evaluate(
            "user", None, "user-1", ACTION_READ, RESOURCE_DOCUMENT,
            resource={"is_active": False},
        )


# ── check_or_raise ────────────────────────────────────────────────────────────

class TestCheckOrRaise:

    def test_permitted_does_not_raise(self):
        engine().check_or_raise("admin", None, None, ACTION_READ, RESOURCE_DOCUMENT)

    def test_denied_raises_http_403(self):
        with pytest.raises(HTTPException) as exc_info:
            engine().check_or_raise("viewer", "team-1", "u", ACTION_DELETE, RESOURCE_DOCUMENT)
        assert exc_info.value.status_code == 403

    def test_403_detail_mentions_role_and_action(self):
        with pytest.raises(HTTPException) as exc_info:
            engine().check_or_raise("viewer", None, None, ACTION_WRITE, RESOURCE_DOCUMENT)
        assert "viewer" in exc_info.value.detail
        assert "write" in exc_info.value.detail


# ── add_policy at runtime ─────────────────────────────────────────────────────

class TestAddPolicy:

    def test_runtime_policy_takes_effect(self):
        e = ABACEngine([])  # start empty
        e.add_policy(Policy("analyst", RESOURCE_DOCUMENT, ACTION_READ))
        assert e.evaluate("analyst", None, None, ACTION_READ, RESOURCE_DOCUMENT)

    def test_existing_engine_unaffected_by_other_instance(self):
        e1 = ABACEngine([])
        e2 = ABACEngine([])
        e1.add_policy(Policy("analyst", RESOURCE_DOCUMENT, ACTION_READ))
        # e2 should not have the policy
        assert not e2.evaluate("analyst", None, None, ACTION_READ, RESOURCE_DOCUMENT)


# ── wildcard matching ─────────────────────────────────────────────────────────

class TestWildcardMatching:

    def test_wildcard_role_matches_any(self):
        e = ABACEngine([Policy("*", RESOURCE_DOCUMENT, ACTION_READ)])
        assert e.evaluate("whatever", None, None, ACTION_READ, RESOURCE_DOCUMENT)

    def test_wildcard_resource_matches_any(self):
        e = ABACEngine([Policy("user", "*", ACTION_READ)])
        assert e.evaluate("user", None, None, ACTION_READ, RESOURCE_CONNECTOR)

    def test_wildcard_action_matches_any(self):
        e = ABACEngine([Policy("user", RESOURCE_DOCUMENT, "*")])
        assert e.evaluate("user", None, None, ACTION_DELETE, RESOURCE_DOCUMENT)
