"""Enterprise Test Intelligence Agent — multi-build failure classifier with probabilistic RCA + RAG memory."""
import json
import traceback
import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.llm.groq_llm import chat

_LOG = logging.getLogger(__name__)

# ── RAG memory helpers ─────────────────────────────────────────────────────────
# Lazy-imported so the agent still works if Pinecone/Mistral keys are absent.

_MEMORY_NS = "test-intelligence"  # Pinecone namespace for failure memory


def _embed(text: str) -> Optional[List[float]]:
    try:
        from backend.embeddings.mistral_embedder import embed_query
        return embed_query(text)
    except Exception as e:
        _LOG.warning("Embed failed (RAG disabled): %s", e)
        return None


def _search_similar_failures(query: str, top_k: int = 4) -> str:
    """Return a short context string of similar past failures from Pinecone."""
    vec = _embed(query)
    if vec is None:
        return ""
    try:
        from backend.vectorstore.pinecone_store import query as pinecone_query
        hits = pinecone_query(vec, top_k=top_k, namespace=_MEMORY_NS, filter=None)
        if not hits:
            return ""
        lines = []
        for h in hits:
            if h["score"] < 0.82:   # only surface high-confidence matches
                continue
            m = h["metadata"]
            lines.append(
                f"- [{m.get('date','?')}] {m.get('test_name','?')} → "
                f"{m.get('failure_category','?')} (score {m.get('flaky_score','?')}) | "
                f"Fix: {m.get('fix_description','unknown')}"
            )
        return "\n".join(lines) if lines else ""
    except Exception as e:
        _LOG.warning("Pinecone search failed: %s", e)
        return ""


def _index_failures_bg(tests: List[Dict], suite_hint: str) -> None:
    """Background thread: embed each analysed failure and upsert into Pinecone."""
    def _run():
        try:
            from backend.vectorstore.pinecone_store import upsert
            date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            chunks, embeddings = [], []
            texts_to_embed = []

            for t in tests:
                if t.get("flaky_score", 0) == 0:
                    continue  # skip stable tests
                embed_text = (
                    f"{t.get('name','')} | "
                    f"{t.get('failure_category','')} | "
                    f"{(t.get('root_causes') or [{}])[0].get('evidence','')} | "
                    f"{t.get('suggested_fix',{}).get('description','')}"
                )
                texts_to_embed.append(embed_text)
                chunks.append({
                    "id": f"ti-{uuid.uuid4().hex[:12]}",
                    "text": embed_text,
                    "metadata": {
                        "test_name":        t.get("name", "")[:200],
                        "failure_category": t.get("failure_category", "Unknown"),
                        "flaky_score":      t.get("flaky_score", 0),
                        "confidence":       t.get("confidence", 0),
                        "fix_description":  t.get("suggested_fix", {}).get("description", "")[:300],
                        "fix_before":       t.get("suggested_fix", {}).get("before", "")[:300],
                        "fix_after":        t.get("suggested_fix", {}).get("after", "")[:300],
                        "suite":            suite_hint[:100],
                        "date":             date_str,
                        "source":           "flaky-intelligence",
                    },
                })

            if not chunks:
                return

            from backend.embeddings.mistral_embedder import embed_texts
            vecs = embed_texts(texts_to_embed)
            upsert(chunks, vecs, namespace=_MEMORY_NS)
            _LOG.info("Indexed %d failure(s) into Pinecone namespace '%s'", len(chunks), _MEMORY_NS)
        except Exception as e:
            _LOG.warning("Background RAG indexing failed: %s", e)

    threading.Thread(target=_run, daemon=True).start()

# ── Stage 1 prompt: classify + score + RCA hypotheses ─────────────────────────

_CLASSIFY_PROMPT = """You are an enterprise test intelligence system specializing in probabilistic root cause analysis.

## FAILURE CATEGORIES  (assign exactly ONE per test)
- Product Bug       : Application defect — broken UI, wrong API response, regression from code change
- Automation Bug    : Test code defect — wrong assertion, hardcoded value, bad POM usage, wrong expected result
- Timing Issue      : Async race condition, spinner not awaited, waitForTimeout too short, animation not complete
- Test Data         : Missing/stale/polluted test data, shared DB state, test ordering dependency
- Infrastructure    : CI agent crash, memory/CPU exhaustion, Docker restart, disk full, runner flap
- Environment       : Missing env var, wrong config, port conflict, SSL cert error, DB connection refused
- Network           : External API timeout, DNS failure, rate-limited 3rd-party, slow response
- State Leakage     : Dirty state from previous test, missing beforeEach/afterAll cleanup
- Flaky             : Non-deterministic — passes on immediate retry with zero changes
- Unknown           : Insufficient evidence to classify

## PASS RATE  (string like "43%")
Count PASS entries in run_history ÷ total runs × 100.
Example: ["PASS","FAIL","PASS","FAIL","FAIL"] → 2 pass out of 5 → "40%"

Note: flaky_score and action are computed by the system — do NOT include them in your output.

## PRIORITY
  Critical  → failure_category is Product Bug or Infrastructure AND fails in >50% of runs
  High      → fails in >50% of runs, any category
  Medium    → fails in 20–50% of runs
  Low       → fails in <20% of runs

## CONFIDENCE  (integer 0–100)
How certain are you in the primary failure_category?
  90–100  → Clear error message + pattern matches exactly
  70–89   → Strong indicators, minor ambiguity
  50–69   → Educated inference from limited data
  <50     → Use "Unknown"

## ROOT CAUSES
Provide top 2–3 ranked hypotheses. Probabilities across all hypotheses must sum to ≤ 100.
Each entry: cause (name from categories list), probability (0–100), evidence (what in the log/history supports this — be specific).

## ABSOLUTE RULES
- Return ONLY valid JSON. No markdown. No prose.
- Every test in the input that has any FAIL result must appear in "tests".
- Stable tests (all PASS) may be omitted.
- Keep evidence strings under 15 words.

## OUTPUT FORMAT  (flaky_score and action are NOT in this schema — system computes them)
{
  "tests": [
    {
      "name": "exact test name from input",
      "failure_category": "Timing Issue",
      "confidence": 91,
      "pass_rate": "43%",
      "run_history": ["PASS","FAIL","PASS","FAIL","FAIL","PASS","FAIL"],
      "root_causes": [
        {"cause": "Timing Issue", "probability": 88, "evidence": "5/7 failures show waitForTimeout exceeded on spinner"},
        {"cause": "Flaky",        "probability": 9,  "evidence": "1 failure passed immediately on retry with no change"}
      ],
      "priority": "High",
      "estimated_fix_time": "1h"
    }
  ],
  "summary": {
    "total_tests": 10,
    "builds_analyzed": 5,
    "categories": {
      "Product Bug": 2, "Automation Bug": 1, "Timing Issue": 3,
      "Test Data": 1, "Infrastructure": 0, "Environment": 0,
      "Network": 0, "State Leakage": 1, "Flaky": 1, "Unknown": 1
    },
    "most_common_category": "Timing Issue",
    "prod_readiness_score": 68
  },
  "release_gate": {
    "decision": "Block",
    "reason": "2 Product Bugs in critical auth flow — must fix before production release."
  }
}"""

# ── Stage 2 prompt: code fixes + AI narrative ─────────────────────────────────

_FIX_PROMPT = """You are a senior automation architect generating specific, runnable code fixes for failing tests.

## RULES FOR FIXES
- before : the actual problematic code pattern (real code, NOT a description)
- after  : the corrected version using proper Playwright/test patterns
- description : one sentence — what changes and why

Special cases by category:
- Product Bug         → before/after = "" ; description = "File bug — this is an application defect, not a test defect."
- Infrastructure/Env  → before/after = "" ; description = "Check CI config — see evidence for the environment issue."
- Unknown             → before/after = "" ; description = "Collect more evidence across 5+ runs before actioning."

## ABSOLUTE RULES
- Return ONLY valid JSON. No markdown.
- The "fixes" object keys MUST exactly match the "name" fields provided.

## OUTPUT FORMAT
{
  "fixes": {
    "exact test name": {
      "description": "Replace fixed timeout with explicit wait for spinner to disappear",
      "before": "await page.waitForTimeout(5000);",
      "after":  "await expect(page.locator('[data-testid=spinner]')).toBeHidden({ timeout: 15000 });"
    }
  },
  "ai_report": {
    "executive_summary": "2–3 sentences on overall suite health from an engineering manager's perspective.",
    "top_recommendation": "The single highest-ROI action the team should take this sprint.",
    "defect_breakdown": "X product bugs, Y automation issues, Z infrastructure failures, W genuinely flaky tests."
  }
}"""


# ── Deterministic score helpers (never trust LLM for arithmetic) ──────────────

def _score_from_history(run_history: List[str]) -> int:
    """Failure frequency score: 0–100 = round((1 - pass_rate) * 100)."""
    if not run_history:
        return 0
    total = len(run_history)
    passes = sum(1 for r in run_history if str(r).upper() == "PASS")
    return round((1 - passes / total) * 100)


def _score_from_pass_rate(pass_rate: str) -> int:
    """Parse a pass_rate string like '43%' → score 57."""
    try:
        rate = float(str(pass_rate).strip().rstrip("%")) / 100.0
        return round((1 - rate) * 100)
    except Exception:
        return 0


def _action_from_score(score: int) -> str:
    if score >= 80: return "Fix Now"
    if score >= 50: return "Quarantine"
    if score >= 20: return "Monitor"
    return "Stable"


def _enrich_test(t: Dict) -> Dict:
    """Compute flaky_score and action deterministically from run_history / pass_rate."""
    history = t.get("run_history", [])
    if history:
        score = _score_from_history(history)
        # Recompute pass_rate string to keep it consistent
        total = len(history)
        passes = sum(1 for r in history if str(r).upper() == "PASS")
        t["pass_rate"] = f"{round(passes / total * 100)}%"
    elif "pass_rate" in t:
        score = _score_from_pass_rate(t["pass_rate"])
    else:
        score = 0  # No data available — treat as unknown/stable
    t["flaky_score"] = score
    t["action"] = _action_from_score(score)
    return t


# ── Stage functions ────────────────────────────────────────────────────────────

def _stage1_classify(content: str) -> Dict[str, Any]:
    # Search RAG memory for similar past failures to enrich the prompt
    history_ctx = _search_similar_failures(content[:800])
    history_block = ""
    if history_ctx:
        history_block = (
            "\n\nHISTORICAL CONTEXT — similar failures indexed from past analyses:\n"
            + history_ctx
            + "\nUse this only as supporting evidence; do not copy it verbatim.\n"
        )

    result = chat(
        [
            {"role": "system",  "content": _CLASSIFY_PROMPT},
            {"role": "user",    "content": (
                f"Analyze these test execution results across multiple builds:\n\n{content[:4000]}"
                f"{history_block}\n\n"
                "Classify every failing or flaky test. "
                "Extract run_history as an array of PASS/FAIL strings in run order. "
                "Return ONLY valid JSON — no other text."
            )},
        ],
        temperature=0.1,
        max_tokens=3500,
        json_mode=True,
    )
    data = json.loads(result["answer"])
    data.setdefault("tests", [])
    data.setdefault("summary", {})
    data.setdefault("release_gate", {"decision": "Conditional", "reason": "Analysis complete."})
    # Compute flaky_score and action in Python — never rely on LLM arithmetic
    data["tests"] = [_enrich_test(t) for t in data["tests"]]
    # Carry historical context forward so the response can surface it
    data["_history_ctx"] = history_ctx
    return {**data, "_tok1": result["tokens_used"], "_lat1": result["latency_ms"]}


def _stage2_fixes(tests: List[Dict], summary: Dict[str, Any]) -> Dict[str, Any]:
    # Build concise representation to stay within token budget
    concise = [
        {
            "name":             t.get("name", ""),
            "failure_category": t.get("failure_category", "Unknown"),
            "flaky_score":      t.get("flaky_score", 0),
            "top_evidence":     (t.get("root_causes") or [{}])[0].get("evidence", ""),
        }
        for t in tests
    ]

    result = chat(
        [
            {"role": "system",  "content": _FIX_PROMPT},
            {"role": "user",    "content": (
                f"Test analysis:\n{json.dumps(concise, indent=2)[:3000]}\n\n"
                f"Suite summary: {json.dumps(summary)[:500]}\n\n"
                "Generate before/after code fix for every test and the executive AI report. "
                "Return ONLY valid JSON."
            )},
        ],
        temperature=0.15,
        max_tokens=2500,
        json_mode=True,
    )
    data = json.loads(result["answer"])
    data.setdefault("fixes", {})
    data.setdefault("ai_report", {
        "executive_summary":  "Test suite analysis complete.",
        "top_recommendation": "Review the Fix Now tests first.",
        "defect_breakdown":   "See category breakdown in the summary.",
    })
    return {**data, "_tok2": result["tokens_used"], "_lat2": result["latency_ms"]}


# ── Public entry point ─────────────────────────────────────────────────────────

def run(content: str, options: Dict[str, Any] = {}) -> Dict[str, Any]:
    try:
        # Normalise input format (JUnit XML / Playwright JSON / plain text)
        from backend.parsers.test_report_normalizer import normalize
        try:
            normalised = normalize(content)
        except Exception:
            normalised = content  # fallback to raw text

        s1 = _stage1_classify(normalised)
        tests: List[Dict]   = s1.get("tests", [])
        summary: Dict       = s1.get("summary", {})
        release_gate: Dict  = s1.get("release_gate", {})
        history_ctx: str    = s1.get("_history_ctx", "")

        s2 = _stage2_fixes(tests, summary)
        fixes: Dict         = s2.get("fixes", {})
        ai_report: Dict     = s2.get("ai_report", {})

        # Merge code fixes into each test object
        _empty_fix = {"description": "See root cause analysis.", "before": "", "after": ""}
        for t in tests:
            t["suggested_fix"] = fixes.get(t.get("name", ""), _empty_fix)

        # Background: index this analysis into Pinecone for future runs
        suite_hint = summary.get("most_common_category", "")
        _index_failures_bg(tests, suite_hint)

        # Parse history context into structured list for the frontend
        history_matches = []
        if history_ctx:
            for line in history_ctx.splitlines():
                line = line.strip().lstrip("- ")
                if line:
                    history_matches.append(line)

        return {
            "tests":           tests,
            "summary":         summary,
            "release_gate":    release_gate,
            "ai_report":       ai_report,
            "history_matches": history_matches,
            "tokens_used":     s1.get("_tok1", 0) + s2.get("_tok2", 0),
            "latency_ms":      s1.get("_lat1", 0) + s2.get("_lat2", 0),
        }

    except Exception as exc:
        _LOG.error("Flaky intelligence stage error: %s", traceback.format_exc())
        raise RuntimeError(f"Flaky analyzer failed: {type(exc).__name__}: {exc}") from exc
