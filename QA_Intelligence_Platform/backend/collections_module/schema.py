"""
Collection schemas — defines all Qdrant collections and their payload indexes.

One collection per source type. Separate vector spaces + metadata schemas
enable faster retrieval and cleaner metadata filtering without cross-contamination.
"""
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class CollectionSchema:
    name: str
    description: str
    source_type: str
    indexed_fields: list[str] = field(default_factory=list)  # Qdrant payload indexes


COLLECTIONS: dict[str, CollectionSchema] = {
    "selenium": CollectionSchema(
        name="selenium",
        description="Selenium / Java / C# automation code",
        source_type="code",
        indexed_fields=["repo", "framework", "language", "module", "component", "owner"],
    ),
    "playwright": CollectionSchema(
        name="playwright",
        description="Playwright TypeScript / JavaScript automation code",
        source_type="code",
        indexed_fields=["repo", "framework", "language", "module", "component", "owner"],
    ),
    "jira": CollectionSchema(
        name="jira",
        description="JIRA issues — bugs, stories, epics",
        source_type="jira",
        indexed_fields=["issue_type", "priority", "status", "sprint", "owner", "labels"],
    ),
    "testcases": CollectionSchema(
        name="testcases",
        description="Manual and automated test cases",
        source_type="excel",
        indexed_fields=["module", "feature", "priority", "automation_status"],
    ),
    "prd": CollectionSchema(
        name="prd",
        description="PRD, BRD, SRS, requirements documents",
        source_type="markdown",
        indexed_fields=["doc_title", "version", "department"],
    ),
    "logs": CollectionSchema(
        name="logs",
        description="Application and CI/CD log files",
        source_type="logs",
        indexed_fields=["service", "env", "severity"],
    ),
    "meeting_notes": CollectionSchema(
        name="meeting_notes",
        description="Meeting notes, retrospectives, decisions",
        source_type="meeting_notes",
        indexed_fields=["topic", "participants"],
    ),
    "lucid": CollectionSchema(
        name="lucid",
        description="Lucidchart diagrams, architecture diagrams",
        source_type="text",
        indexed_fields=["diagram_id", "element_type"],
    ),
    "company_docs": CollectionSchema(
        name="company_docs",
        description="Internal documentation, runbooks, wikis",
        source_type="pdf",
        indexed_fields=["department", "doc_type"],
    ),
    "jenkins": CollectionSchema(
        name="jenkins",
        description="Jenkins build records and CI results",
        source_type="text",
        indexed_fields=["job", "result", "branch"],
    ),
}
