"""
Neo4j schema: uniqueness constraints + indexes for the QA Knowledge Graph.

Node types and their primary key:
  Requirement   — id (UUID or external ref)
  Epic          — id (Jira epic key, e.g. "QA-1")
  Story         — id (Jira issue key, e.g. "QA-12")
  Feature       — id (derived from module+feature name)
  Module        — id (module name slug)
  TestCase      — id (chunk_id from RAG store OR Jira/TestRail key)
  Bug           — id (Jira issue key)
  Release       — id (version string, e.g. "v2.3.0")
  APIEndpoint   — id (method:path, e.g. "GET:/api/search")

Relationships:
  Story      -[:IMPLEMENTS]->  Requirement
  Story      -[:BELONGS_TO]->  Epic
  Story      -[:TARGETS]->     Release
  TestCase   -[:COVERS]->      Story
  TestCase   -[:COVERS]->      Requirement
  TestCase   -[:VALIDATES]->   APIEndpoint
  Bug        -[:FOUND_IN]->    TestCase
  Bug        -[:AFFECTS]->     Story
  Bug        -[:AFFECTS]->     Feature
  Bug        -[:FIXED_IN]->    Release
  Feature    -[:BELONGS_TO]->  Module
  APIEndpoint-[:BELONGS_TO]->  Module
  Requirement-[:PART_OF]->     Epic
"""
from __future__ import annotations

import logging
from typing import List, Tuple

logger = logging.getLogger(__name__)

# (node_label, property)
_CONSTRAINTS: List[Tuple[str, str]] = [
    ("Requirement",  "id"),
    ("Epic",         "id"),
    ("Story",        "id"),
    ("Feature",      "id"),
    ("Module",       "id"),
    ("TestCase",     "id"),
    ("Bug",          "id"),
    ("Release",      "id"),
    ("APIEndpoint",  "id"),
    ("PipelineRun",  "id"),
]

# Additional indexes for frequent lookups
_INDEXES: List[Tuple[str, str]] = [
    ("Story",        "team_id"),
    ("TestCase",     "team_id"),
    ("Bug",          "team_id"),
    ("Feature",      "team_id"),
    ("PipelineRun",  "team_id"),
    ("Story",        "status"),
    ("Bug",          "severity"),
    ("TestCase",     "automation_status"),
    ("Release",      "version"),
    ("Story",        "jira_key"),
    ("Bug",          "jira_key"),
    ("PipelineRun",  "branch"),
    ("PipelineRun",  "conclusion"),
]


def apply_schema() -> None:
    """
    Apply uniqueness constraints and indexes.
    Safe to call on every startup — Neo4j ignores already-existing constraints.
    """
    from backend.graph.neo4j_client import run_query

    created = 0
    for label, prop in _CONSTRAINTS:
        constraint_name = f"unique_{label.lower()}_{prop}"
        cypher = (
            f"CREATE CONSTRAINT {constraint_name} IF NOT EXISTS "
            f"FOR (n:{label}) REQUIRE n.{prop} IS UNIQUE"
        )
        run_query(cypher, write=True)
        created += 1

    for label, prop in _INDEXES:
        index_name = f"idx_{label.lower()}_{prop}"
        cypher = (
            f"CREATE INDEX {index_name} IF NOT EXISTS "
            f"FOR (n:{label}) ON (n.{prop})"
        )
        run_query(cypher, write=True)

    logger.info("Neo4j schema: %d constraints + %d indexes applied", created, len(_INDEXES))
