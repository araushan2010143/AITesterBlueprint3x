"""Integration tests — health, root, stats, and LLM status endpoints."""
import os
os.environ.setdefault("RATE_LIMIT_DISABLED", "true")

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from backend.main import app

client = TestClient(app, raise_server_exceptions=False)


# ── GET / ─────────────────────────────────────────────────────────────────────

class TestRoot:

    def test_root_returns_200(self):
        assert client.get("/").status_code == 200

    def test_root_body_has_name(self):
        assert "QA RAG Platform" in client.get("/").json()["name"]

    def test_root_body_has_docs_link(self):
        r = client.get("/").json()
        assert "/api/docs" in r.get("docs", "")

    def test_root_body_has_features_list(self):
        r = client.get("/").json()
        assert isinstance(r.get("features"), list)
        assert len(r["features"]) > 0

    def test_root_body_has_version(self):
        r = client.get("/").json()
        assert "version" in r


# ── GET /health ───────────────────────────────────────────────────────────────

class TestHealth:

    def test_health_returns_200(self):
        assert client.get("/health").status_code == 200

    def test_health_status_is_ok(self):
        r = client.get("/health").json()
        assert r.get("status") == "ok"

    def test_health_has_version(self):
        r = client.get("/health").json()
        assert "version" in r

    def test_health_has_database_key(self):
        r = client.get("/health").json()
        assert "database" in r

    def test_health_has_llm_key(self):
        r = client.get("/health").json()
        assert "llm" in r

    def test_health_has_redis_key(self):
        r = client.get("/health").json()
        assert "redis" in r

    def test_health_has_vector_store_key(self):
        r = client.get("/health").json()
        assert "vector_store" in r

    def test_health_has_vault_key(self):
        r = client.get("/health").json()
        assert "vault" in r

    def test_health_has_graph_key(self):
        r = client.get("/health").json()
        assert "graph" in r

    def test_health_has_env_key(self):
        r = client.get("/health").json()
        assert "env" in r

    def test_health_env_values_are_booleans(self):
        r = client.get("/health").json()
        env = r.get("env", {})
        assert all(isinstance(v, bool) for v in env.values())

    def test_health_database_status_present(self):
        r = client.get("/health").json()
        assert "status" in r.get("database", {})

    def test_health_llm_available_count_present(self):
        r = client.get("/health").json()
        assert "available_count" in r.get("llm", {})

    def test_health_env_has_mistral_key(self):
        r = client.get("/health").json()
        assert "MISTRAL_API_KEY" in r.get("env", {})

    def test_health_env_has_groq_key(self):
        r = client.get("/health").json()
        assert "GROQ_API_KEY" in r.get("env", {})

    def test_health_env_never_exposes_raw_values(self):
        r = client.get("/health").json()
        env = r.get("env", {})
        # Values must be booleans, not actual key strings
        for k, v in env.items():
            assert isinstance(v, bool), f"env[{k}] should be bool, got {type(v)}"

    def test_health_accepts_head_request(self):
        r = client.request("HEAD", "/health")
        assert r.status_code in (200, 405)  # 405 if HEAD not explicitly registered

    def test_health_llm_total_count_is_integer(self):
        r = client.get("/health").json()
        llm = r.get("llm", {})
        assert isinstance(llm.get("total_count", 0), int)


# ── GET /api/stats ────────────────────────────────────────────────────────────

class TestStats:

    def test_stats_returns_200(self):
        r = client.get("/api/stats")
        assert r.status_code == 200

    def test_stats_has_total_documents(self):
        r = client.get("/api/stats").json()
        assert "total_documents" in r

    def test_stats_has_total_chunks(self):
        r = client.get("/api/stats").json()
        assert "total_chunks" in r


# ── GET /api/stats/health ─────────────────────────────────────────────────────

class TestLegacyStatsHealth:

    def test_stats_health_returns_200(self):
        r = client.get("/api/stats/health")
        assert r.status_code == 200

    def test_stats_health_has_status(self):
        r = client.get("/api/stats/health").json()
        assert "status" in r


# ── GET /api/llm/status ───────────────────────────────────────────────────────

class TestLLMStatus:

    def test_llm_status_returns_200(self):
        r = client.get("/api/llm/status")
        assert r.status_code == 200

    def test_llm_status_has_providers_list(self):
        r = client.get("/api/llm/status").json()
        assert "providers" in r
        assert isinstance(r["providers"], list)

    def test_llm_status_has_available_count(self):
        r = client.get("/api/llm/status").json()
        assert "available_count" in r

    def test_llm_status_provider_has_name_and_available(self):
        r = client.get("/api/llm/status").json()
        for p in r.get("providers", []):
            assert "name" in p
            assert "available" in p

    def test_llm_status_available_count_lte_total(self):
        r = client.get("/api/llm/status").json()
        assert r.get("available_count", 0) <= len(r.get("providers", []))


# ── OpenAPI / Swagger docs ────────────────────────────────────────────────────

class TestOpenAPI:

    def test_api_docs_returns_200(self):
        r = client.get("/api/docs")
        assert r.status_code in (200, 307)

    def test_openapi_json_returns_200(self):
        r = client.get("/openapi.json")
        assert r.status_code == 200

    def test_openapi_json_has_paths(self):
        r = client.get("/openapi.json").json()
        assert "paths" in r

    def test_openapi_json_title(self):
        r = client.get("/openapi.json").json()
        assert "QA RAG Platform" in r.get("info", {}).get("title", "")

    def test_redoc_returns_200(self):
        r = client.get("/api/redoc")
        assert r.status_code in (200, 307)
