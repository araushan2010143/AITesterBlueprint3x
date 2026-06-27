# Flaky Test Analyzer — Langflow AI Pipeline

Compares two Playwright JSON test runs, detects flaky / consistent-failure / retry-only-flaky tests using a custom Python component, then uses a Groq LLM to produce a structured QA report.

---

## Architecture

```
[File — Build 1 JSON]──┐
                        ├──► [FlakyDiff Custom Component]──► [Prompt Template]──► [Groq LLM]──► [Structured Output]──► [Chat Output]
[File — Build 2JSON]───┘
```

Node count: **6 nodes, 5 edges**

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.10+ |
| Langflow | 1.0+ |
| Groq API Key | Free tier at console.groq.com |

---

## 1 — Install Langflow

```bash
# Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install Langflow
pip install langflow

# Start the server
langflow run
# Opens at http://127.0.0.1:7860
```

Or with Docker:

```bash
docker run -p 7860:7860 langflowai/langflow:latest
```

---

## 2 — Get a Groq API Key

1. Go to [https://console.groq.com](https://console.groq.com)
2. Sign up (free) → API Keys → Create new key
3. Copy the key — you will paste it into the Groq node in Langflow

---

## 3 — Add the Custom Component (FlakyDiff)

1. In Langflow, click **Settings** (gear icon, top-right) → **Custom Components**
2. Click **+ New Component**
3. Paste the full contents of `FlakyDiff.py` into the editor
4. Click **Save**
5. The component now appears in the sidebar under **Custom** as **Flaky Test Diff**

---

## 4 — Build the Flow (Node by Node)

Open a new flow in Langflow and add the following nodes:

### Node 1 — File (Build 1)
- Sidebar → **Data** → **File**
- Upload `results_build1.json`
- Rename node to `Build 1 Report`

### Node 2 — File (Build 2)
- Sidebar → **Data** → **File**
- Upload `results_build2.json`
- Rename node to `Build 2 Report`

### Node 3 — Flaky Test Diff (Custom Component)
- Sidebar → **Custom** → **Flaky Test Diff**
- No manual configuration needed — inputs come from wiring

### Node 4 — Prompt Template
- Sidebar → **Prompts** → **Prompt**
- Paste the full contents of `prompt.txt` into the template field
- The `{analysis}` placeholder will be filled by the FlakyDiff output

### Node 5 — Groq
- Sidebar → **Models** → **Groq**
- Model: `llama-3.3-70b-versatile` (or `meta-llama/llama-4-scout-17b-16e-instruct`)
- Paste your Groq API key into the **API Key** field
- Temperature: `0.2` (lower = more deterministic analysis)

### Node 6 — Structured Output
- Sidebar → **Outputs** → **Structured Output**
- Click **Edit Schema** → paste the full contents of `schema.json`

### Node 7 — Chat Output
- Sidebar → **Outputs** → **Chat Output**
- Default settings are fine

---

## 5 — Wire the Edges

Connect nodes in this order:

| From (Node : Port) | To (Node : Port) |
|---|---|
| Build 1 Report : `text` | Flaky Test Diff : `Build 1 JSON` |
| Build 2 Report : `text` | Flaky Test Diff : `Build 2 JSON` |
| Flaky Test Diff : `Analysis` | Prompt Template : `analysis` |
| Prompt Template : `Prompt Message` | Groq : `Input` |
| Groq : `Text` | Structured Output : `Input` |
| Structured Output : `Output` | Chat Output : `Input` |

---

## 6 — Run the Flow

1. Click the **Run** (▶) button in the top-right
2. The Chat Output node will display the structured JSON analysis
3. Expected output shape:

```json
{
  "flaky_tests": [
    {
      "title": "Search Test",
      "root_cause_hypothesis": "Test passed in Build 1 (with 1 retry) but failed outright in Build 2, suggesting a timing-dependent DOM interaction or async wait issue.",
      "recommendation": "Add explicit waitForSelector before asserting search results; investigate network stub stability."
    }
  ],
  "retry_only_flaky": [],
  "consistent_failures": [
    {
      "title": "Checkout Test",
      "error_summary": "Payment API timeout in both builds",
      "recommendation": "This is a real bug, not flakiness. The Payment API endpoint is unreliable — escalate to backend team immediately."
    }
  ],
  "stable_tests": ["Login Test", "Profile Update Test", "Logout Test"],
  "rerun_recommendation": "Rerun Search Test only — it is flaky. Do NOT rerun Checkout Test; it consistently fails due to a backend issue.",
  "priority_fix_list": [
    {
      "rank": 1,
      "test_title": "Checkout Test",
      "issue_type": "consistent_failure",
      "justification": "Blocks payments; fails every run — immediate backend fix required."
    },
    {
      "rank": 2,
      "test_title": "Search Test",
      "issue_type": "flaky",
      "justification": "Unreliable signal in CI; needs stabilization before it masks real regressions."
    }
  ],
  "overall_health_score": "UNSTABLE",
  "health_score_reason": "1 consistent failure and 1 flaky test out of 5 total tests indicates the suite cannot be trusted as a quality gate.",
  "flaky_count": 1,
  "consistent_failure_count": 1,
  "summary": "Build comparison reveals 1 genuine bug (Checkout Test — Payment API timeout in both runs) and 1 flaky test (Search Test — status flipped between builds). 3 out of 5 tests are stable. Immediate action needed on the Checkout failure; Search Test needs async stabilization."
}
```

---

## File Reference

| File | Purpose |
|------|---------|
| `FlakyDiff.py` | Langflow custom component — compares two Playwright reports |
| `results_build1.json` | Sample Playwright report — Build 1 |
| `results_build2.json` | Sample Playwright report — Build 2 |
| `prompt.txt` | LLM prompt template (paste into Prompt node) |
| `schema.json` | Structured output JSON schema (paste into Structured Output node) |
| `README.md` | This file |

---

## What FlakyDiff Detects

| Category | Definition |
|----------|-----------|
| **Flaky** | Status changed between builds (pass→fail or fail→pass) |
| **Retry-Only Flaky** | Passed in both builds but required `retries > 0` — hidden instability |
| **Consistent Failure** | Failed in BOTH builds — a real bug, not flakiness |
| **Stable** | Passed in both builds with zero retries |
| **Inconclusive** | Test only appeared in one build (new/removed test) |

---

## Playwright JSON Format

Your Playwright reports must follow this structure:

```json
{
  "tests": [
    {
      "title": "Test name (unique identifier)",
      "status": "passed | failed | skipped | timedOut",
      "retries": 0,
      "duration": 2100,
      "error": "Optional error message (only on failure)"
    }
  ]
}
```

To export from Playwright in this format, add to `playwright.config.ts`:

```ts
reporter: [['json', { outputFile: 'results.json' }]]
```

---

## Troubleshooting

**"Module not found" in custom component**
→ Langflow runs components in its own Python environment. Make sure you installed Langflow in the same venv you're running it from.

**Groq returns 401 Unauthorized**
→ Double-check the API key in the Groq node. Keys from console.groq.com are prefixed with `gsk_`.

**Structured Output node returns plain text instead of JSON**
→ The schema must be valid JSON. Validate `schema.json` at [jsonlint.com](https://jsonlint.com) before pasting.

**File node outputs empty text**
→ Langflow's File node outputs the file content as a `Message`. The FlakyDiff component expects the `.text` property. Make sure you connect the **text** output port of the File node, not the **file** port.

**FlakyDiff returns `ERROR: Invalid JSON input`**
→ The File node may be wrapping the content. In the FlakyDiff component, add a `json.loads` guard — or pre-process with a **Parse Data** node between File and FlakyDiff.
