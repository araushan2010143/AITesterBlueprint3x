"""
Intent Classifier — routes queries to the right Qdrant collection(s).

Instead of searching every collection for every query, we classify first:

    "Where is switchMediaType() implemented?"  → intent: CODE  → collection: [selenium, playwright]
    "Find bug for login timeout"               → intent: BUG   → collection: [jira]
    "Show TC-456 test steps"                   → intent: TEST  → collection: [testcases]
    "What does PRD say about media upload?"    → intent: PRD   → collection: [prd, company_docs]
    "Why did Jenkins build #123 fail?"         → intent: CI    → collection: [jenkins, logs]

This dramatically improves retrieval quality by narrowing the search space.
"""
from __future__ import annotations
from enum import Enum
from dataclasses import dataclass, field


class QueryIntent(str, Enum):
    CODE        = "code"          # code implementation questions
    BUG         = "bug"           # JIRA issues, defect lookup
    TEST        = "test"          # test cases, test steps
    PRD         = "prd"           # requirements, PRD, BRD, SRS
    CI          = "ci"            # Jenkins, CI/CD failures
    LOGS        = "logs"          # log analysis, error trace
    MEETING     = "meeting"       # meeting notes, decisions
    FRAMEWORK   = "framework"     # framework help, patterns, best practices
    MIGRATION   = "migration"     # Selenium → Playwright migration
    GENERAL     = "general"       # fallback — search all collections


# Maps intent → one or more Qdrant collection names
INTENT_COLLECTIONS: dict[QueryIntent, list[str]] = {
    QueryIntent.CODE:       ["selenium", "playwright"],
    QueryIntent.BUG:        ["jira"],
    QueryIntent.TEST:       ["testcases"],
    QueryIntent.PRD:        ["prd", "company_docs"],
    QueryIntent.CI:         ["jenkins", "logs"],
    QueryIntent.LOGS:       ["logs"],
    QueryIntent.MEETING:    ["meeting_notes"],
    QueryIntent.FRAMEWORK:  ["selenium", "playwright", "company_docs"],
    QueryIntent.MIGRATION:  ["selenium", "playwright"],
    QueryIntent.GENERAL:    [],  # empty = search all
}


@dataclass
class ClassificationResult:
    intent: QueryIntent
    collections: list[str]
    confidence: float = 1.0
    metadata_hints: dict = field(default_factory=dict)


class IntentClassifier:
    """
    Classifies a query string into a QueryIntent.

    Phase 1: keyword-based rules (fast, no LLM call).
    Phase 2: lightweight LLM classifier or fine-tuned model.
    """

    _CODE_KEYWORDS    = {"implements", "method", "function", "class", "line", "file", "def ", "void", "return"}
    _BUG_KEYWORDS     = {"bug", "defect", "jira", "issue", "ticket", "error", "failure", "fix"}
    _TEST_KEYWORDS    = {"test case", "tc-", "test step", "test data", "scenario", "bdd", "gherkin"}
    _PRD_KEYWORDS     = {"requirement", "prd", "brd", "srs", "acceptance criteria", "user story", "feature request"}
    _CI_KEYWORDS      = {"jenkins", "build", "pipeline", "ci", "cd", "deploy", "artifact", "stage"}
    _LOG_KEYWORDS     = {" log ", "log:", "logs", "trace", "stack trace", "exception", "crash", "stdout", "stderr"}
    _MEETING_KEYWORDS = {"meeting", "decision", "action item", "discussed", "agreed", "standup", "retrospective"}
    _MIGRATION_KEYWORDS = {"migrate", "migration", "convert", "selenium to playwright", "rewrite", "port"}

    def classify(self, query: str) -> ClassificationResult:
        q = query.lower()

        if any(k in q for k in self._MIGRATION_KEYWORDS):
            intent = QueryIntent.MIGRATION
        elif any(k in q for k in self._CODE_KEYWORDS):
            intent = QueryIntent.CODE
        elif any(k in q for k in self._BUG_KEYWORDS):
            intent = QueryIntent.BUG
        elif any(k in q for k in self._TEST_KEYWORDS):
            intent = QueryIntent.TEST
        elif any(k in q for k in self._PRD_KEYWORDS):
            intent = QueryIntent.PRD
        elif any(k in q for k in self._CI_KEYWORDS):
            intent = QueryIntent.CI
        elif any(k in q for k in self._LOG_KEYWORDS):
            intent = QueryIntent.LOGS
        elif any(k in q for k in self._MEETING_KEYWORDS):
            intent = QueryIntent.MEETING
        else:
            intent = QueryIntent.GENERAL

        return ClassificationResult(
            intent=intent,
            collections=INTENT_COLLECTIONS[intent],
            confidence=0.85,
        )
