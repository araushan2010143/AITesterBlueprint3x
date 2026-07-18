/**
 * Single source of truth for the Knowledge Base sidebar.
 *
 * KNOWLEDGE_BASE — all 9 predefined collections shown in the sidebar.
 * Counts (points) are overlaid at runtime from /api/collections.
 * A collection with 0 points is "not yet ingested" but still visible.
 *
 * MODES — the five chat modes mapped to their backend agent IDs.
 * "auto-detect" uses the QA Assistant + IntentClassifier to route
 * the query to the right collection(s) automatically.
 */

export interface KBCollection {
  name: string;       // Qdrant collection name
  label: string;      // Display label
  color: string;      // Dot color
}

export interface Mode {
  value: string;      // Internal key
  label: string;      // Display label shown in dropdown
  agent: string;      // Backend AGENT_REGISTRY key
  hint: string;       // Placeholder hint in the input box
}

// ── 9 knowledge-base collections ─────────────────────────────────────────────
export const KNOWLEDGE_BASE: KBCollection[] = [
  { name: "selenium",      label: "Selenium repo",    color: "#B45309" },
  { name: "playwright",    label: "Playwright repo",  color: "#16A34A" },
  { name: "testcases",     label: "Test Cases",       color: "#1D4ED8" },
  { name: "jira",          label: "JIRA tickets",     color: "#2563EB" },
  { name: "company_docs",  label: "Company Docs",     color: "#7C3AED" },
  { name: "meeting_notes", label: "Meeting Notes",    color: "#92400E" },
  { name: "prd",           label: "PRD / BRD / SRS",  color: "#6D28D9" },
  { name: "logs",          label: "Jenkins Logs",     color: "#B91C1C" },
  { name: "glossary",      label: "Glossary",         color: "#475569" },
];

// ── 5 chat modes ─────────────────────────────────────────────────────────────
export const MODES: Mode[] = [
  {
    value: "auto-detect",
    label: "auto-detect",
    agent: "qa_assistant",
    hint:  "ask about tests, tickets, failures, the framework…",
  },
  {
    value: "answer",
    label: "answer",
    agent: "qa_assistant",
    hint:  "ask any QA question — I'll find the answer in your knowledge base…",
  },
  {
    value: "generate_tests",
    label: "generate test cases",
    agent: "rtm_builder",
    hint:  "describe a feature or requirement to generate test cases…",
  },
  {
    value: "coverage",
    label: "review coverage / gaps",
    agent: "coverage_analyzer",
    hint:  "name a feature or module to review test coverage gaps…",
  },
  {
    value: "rca",
    label: "root cause analysis",
    agent: "rca",
    hint:  "describe a failure, paste a stack trace, or mention a build number…",
  },
];

// ── Starter prompts (VWO QA context) ─────────────────────────────────────────
export const STARTERS: string[] = [
  "Why is the checkout coupon test flaky?",
  "What failed in Jenkins build 4521?",
  "Generate test cases for the VWO login module",
  "What is our flaky test quarantine policy?",
];
