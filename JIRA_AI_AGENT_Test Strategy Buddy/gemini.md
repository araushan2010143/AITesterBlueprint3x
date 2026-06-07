# gemini.md — Project Constitution (THE LAW)
> Last updated: 2026-06-07

---

## Project: Test Strategy Buddy
**Mission:** A React application that fetches a JIRA ticket and generates a professional, structured Test Strategy document using GROQ AI.

---

## Data Schema (Input → Output)

### INPUT — User Settings (localStorage)
```json
{
  "jiraEmail": "string (user@domain.com)",
  "jiraToken": "string (Atlassian API token)",
  "jiraBaseUrl": "string (https://yourcompany.atlassian.net)",
  "groqApiKey": "string (gsk_...)",
  "groqModel": "string (openai/gpt-oss-120b)"
}
```

### INPUT — Trigger
```json
{ "ticketId": "string (e.g. KAN-4)" }
```

### JIRA API RESPONSE (Raw)
```json
{
  "key": "KAN-4",
  "fields": {
    "summary": "string",
    "description": "object | string | null (Atlassian Document Format or plain text)",
    "issuetype": { "name": "string" },
    "status": { "name": "string" },
    "priority": { "name": "string" },
    "assignee": { "displayName": "string" } | null,
    "labels": ["string"],
    "components": [{ "name": "string" }],
    "customfield_10014": "string | null (Epic link)",
    "acceptance_criteria": "string | null"
  }
}
```

### OUTPUT — Generated Test Strategy (JSON)
```json
{
  "ticketId": "string",
  "ticketSummary": "string",
  "generatedAt": "ISO 8601 string",
  "strategy": {
    "objective": "string",
    "scope": {
      "inScope": ["string"],
      "outOfScope": ["string"]
    },
    "focusAreas": ["string"],
    "approach": ["string"],
    "deliverables": ["string"],
    "teamAndSchedule": {
      "teamSize": "string",
      "duration": "string",
      "schedule": [{ "phase": "string", "activities": "string" }]
    },
    "entryExitCriteria": {
      "entryCriteria": ["string"],
      "exitCriteria": ["string"]
    },
    "risks": ["string"]
  }
}
```

---

## Architectural Invariants (NEVER VIOLATE)

1. **Credentials are NEVER stored server-side.** They travel from browser → Vercel function → external API within a single request lifecycle.
2. **CORS bypass is mandatory.** JIRA Cloud blocks browser-direct calls. All external API calls route through `/api/jira` and `/api/groq` Vercel serverless functions.
3. **GROQ prompt uses RICE-POT structure.** Role → Instructions → Context (JIRA data) → Example (PDF format) → Parameters → Output (JSON schema) → Tone.
4. **ADF Parser is required.** JIRA Cloud returns description in Atlassian Document Format (JSON). Must be flattened to plain text before sending to GROQ.
5. **Dark mode is class-based.** `darkMode: 'class'` in Tailwind config. Theme stored in localStorage.
6. **No environment variables in source.** `.env` files are gitignored. Credentials live in browser localStorage only.

---

## Behavioral Rules

- If JIRA ticket not found → show error with ticket ID and base URL hint
- If GROQ returns invalid JSON → retry once, then show raw response with parse error
- Settings are validated client-side before any API call
- All sections of test strategy must be populated; no empty arrays
- Loading states shown during JIRA fetch AND GROQ generation separately
