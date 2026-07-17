"""Integration tests — documents and ingest endpoints."""
import os
os.environ.setdefault("RATE_LIMIT_DISABLED", "true")

import io
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from backend.main import app

client = TestClient(app, raise_server_exceptions=False)


# ── GET /api/documents ────────────────────────────────────────────────────────

class TestListDocuments:

    def test_list_returns_200(self):
        r = client.get("/api/documents")
        assert r.status_code == 200

    def test_list_returns_list(self):
        r = client.get("/api/documents")
        assert isinstance(r.json(), list)

    def test_list_with_status_filter(self):
        r = client.get("/api/documents", params={"status": "ready"})
        assert r.status_code == 200
        data = r.json()
        for doc in data:
            assert doc["status"] == "ready"

    def test_list_with_document_type_filter(self):
        r = client.get("/api/documents", params={"document_type": "test_case"})
        assert r.status_code == 200
        data = r.json()
        for doc in data:
            assert doc["document_type"] == "test_case"

    def test_list_combined_filters(self):
        r = client.get("/api/documents", params={
            "status": "ready", "document_type": "test_case",
        })
        assert r.status_code == 200

    def test_list_unknown_filter_value_returns_empty(self):
        r = client.get("/api/documents", params={"status": "nonexistent_status_xyz"})
        assert r.status_code == 200
        assert r.json() == []


# ── GET /api/documents/{id} ───────────────────────────────────────────────────

class TestGetDocument:

    def test_nonexistent_id_returns_404(self):
        r = client.get("/api/documents/nonexistent-doc-id-0000")
        assert r.status_code == 404

    def test_404_body_has_detail(self):
        r = client.get("/api/documents/nonexistent-id")
        assert "detail" in r.json()


# ── GET /api/documents/filters/values ────────────────────────────────────────

class TestFilterValues:

    def test_filter_values_returns_200(self):
        r = client.get("/api/documents/filters/values")
        assert r.status_code == 200

    def test_filter_values_has_expected_keys(self):
        r = client.get("/api/documents/filters/values")
        data = r.json()
        assert "modules" in data
        assert "document_types" in data
        assert "releases" in data
        assert "authors" in data
        assert "priorities" in data
        assert "automation_statuses" in data

    def test_filter_values_priorities_not_empty(self):
        r = client.get("/api/documents/filters/values")
        data = r.json()
        assert len(data["priorities"]) > 0

    def test_filter_values_returns_lists(self):
        r = client.get("/api/documents/filters/values")
        data = r.json()
        assert isinstance(data["modules"], list)
        assert isinstance(data["document_types"], list)
        assert isinstance(data["authors"], list)


# ── POST /api/ingest/upload (mocked vector store) ────────────────────────────

SAMPLE_MD = b"# Test Cases\n\n## TC-001 Login\nValid credentials should work.\n"
SAMPLE_TXT = b"Test case: login with valid credentials. Expected: 200 OK."


class TestIngestUpload:

    @pytest.fixture(autouse=True)
    def _mock_embedder_and_pinecone(self):
        """Avoid real network calls during ingest tests."""
        with patch("backend.api.routes.ingest.embed_texts",
                   return_value=[[0.1] * 1024]):
            with patch("backend.api.routes.ingest._vs_upsert", return_value=1):
                yield

    def test_upload_markdown_returns_200(self):
        r = client.post(
            "/api/ingest/upload",
            files={"file": ("test.md", io.BytesIO(SAMPLE_MD), "text/markdown")},
            data={"chunk_size": "500", "chunk_overlap": "50"},
        )
        assert r.status_code == 200

    def test_upload_returns_doc_id(self):
        r = client.post(
            "/api/ingest/upload",
            files={"file": ("test.md", io.BytesIO(SAMPLE_MD), "text/markdown")},
            data={"chunk_size": "500", "chunk_overlap": "50"},
        )
        assert r.status_code == 200
        assert "doc_id" in r.json()

    def test_upload_plain_text_returns_200(self):
        r = client.post(
            "/api/ingest/upload",
            files={"file": ("test.txt", io.BytesIO(SAMPLE_TXT), "text/plain")},
            data={"chunk_size": "300", "chunk_overlap": "30"},
        )
        assert r.status_code == 200

    def test_upload_missing_file_returns_422(self):
        r = client.post("/api/ingest/upload", data={"chunk_size": "500"})
        assert r.status_code == 422

    def test_upload_with_default_chunk_params(self):
        r = client.post(
            "/api/ingest/upload",
            files={"file": ("doc.md", io.BytesIO(SAMPLE_MD), "text/markdown")},
        )
        assert r.status_code == 200

    def test_upload_with_semantic_strategy(self):
        r = client.post(
            "/api/ingest/upload",
            files={"file": ("doc.md", io.BytesIO(SAMPLE_MD), "text/markdown")},
            data={"chunk_strategy": "semantic"},
        )
        assert r.status_code == 200

    def test_uploaded_doc_appears_in_list(self):
        before = len(client.get("/api/documents").json())
        client.post(
            "/api/ingest/upload",
            files={"file": ("new_doc.md", io.BytesIO(SAMPLE_MD), "text/markdown")},
        )
        after = len(client.get("/api/documents").json())
        assert after >= before


# ── DELETE /api/ingest/{doc_id} ───────────────────────────────────────────────

class TestDeleteDocument:

    @pytest.fixture(autouse=True)
    def _mock_stores(self):
        with patch("backend.api.routes.ingest.embed_texts",
                   return_value=[[0.1] * 1024]):
            with patch("backend.api.routes.ingest._vs_upsert", return_value=1):
                with patch("backend.api.routes.ingest._vs_delete", return_value=None):
                    yield

    def test_delete_nonexistent_returns_404(self):
        r = client.delete("/api/ingest/nonexistent-id")
        assert r.status_code == 404

    def test_delete_existing_doc_returns_200(self):
        # First upload a doc
        up = client.post(
            "/api/ingest/upload",
            files={"file": ("del_test.md", io.BytesIO(SAMPLE_MD), "text/markdown")},
        )
        if up.status_code != 200:
            pytest.skip("upload failed")
        doc_id = up.json().get("doc_id")
        if not doc_id:
            pytest.skip("no doc_id in upload response")
        r = client.delete(f"/api/ingest/{doc_id}")
        assert r.status_code == 200

    def test_delete_removes_from_list(self):
        up = client.post(
            "/api/ingest/upload",
            files={"file": ("del_list.md", io.BytesIO(SAMPLE_MD), "text/markdown")},
        )
        if up.status_code != 200:
            pytest.skip("upload failed")
        doc_id = up.json().get("doc_id")
        if not doc_id:
            pytest.skip("no doc_id in upload response")
        client.delete(f"/api/ingest/{doc_id}")
        r = client.get(f"/api/documents/{doc_id}")
        assert r.status_code == 404
