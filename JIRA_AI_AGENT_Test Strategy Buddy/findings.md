# findings.md — Research & Discoveries
> Project: Test Strategy Buddy | Date: 2026-06-07

## JIRA Cloud API

- **Base URL pattern:** `https://{domain}.atlassian.net/rest/api/3/issue/{ticketId}`
- **Auth:** Basic Auth — `email:apiToken` encoded as Base64
- **Header required:** `Authorization: Basic <base64>`, `Accept: application/json`
- **Description format:** JIRA Cloud uses Atlassian Document Format (ADF) — a nested JSON structure, NOT plain text. Must be parsed recursively to extract text.
- **CORS:** JIRA Cloud blocks browser-direct API calls. Requires server-side proxy.

## GROQ API

- **Base URL:** `https://api.groq.com/openai/v1/chat/completions`
- **Auth:** `Authorization: Bearer <groqApiKey>`
- **Model:** `openai/gpt-oss-120b` (as specified by user — FREE tier)
- **Response format:** Standard OpenAI chat completion format
- **CORS:** May support browser-direct calls but routing through Vercel function for consistency and security

## Vercel Serverless Functions

- **Location:** `/api/*.js` in project root (Vercel auto-detects)
- **Runtime:** Node.js (default)
- **CORS headers:** Must be manually added in each function
- **Environment:** No env vars needed (credentials passed per-request from browser)

## Template Format (from PDF)

8 sections derived from the Ecommerce Test Strategy PDF:
1. **Objective** — singular goal statement
2. **Scope** — in scope + out of scope lists
3. **Focus Areas** — testing types (functional, UI, performance, security, compatibility, usability)
4. **Approach** — methodologies (black/white box, automation tools, exploratory, load testing, security OWASP)
5. **Deliverables** — artifacts to produce
6. **Team & Schedule** — headcount, duration, phase-by-phase schedule
7. **Entry & Exit Criteria** — ready-for-testing + completion conditions
8. **Risks** — identified risk factors

## Node.js / npm

- Node: v24.11.1, npm: v11.6.2 — both current, no constraints
- Vite 5.x is compatible
- Tailwind CSS v3 used (v4 has different config syntax, avoid for stability)

## GitHub

- Git user: araushan2010143
- Repo target: `jira-test-strategy-buddy` (public)
- GitHub CLI (gh) not installed — will use git remote + HTTPS push
- GitHub token required for push — user will need to authenticate

## Vercel

- Vercel CLI not installed — will install via `npm i -g vercel`
- User has Vercel account linked to GitHub (araushan2010143)
- Vercel can auto-deploy from GitHub on push (recommended approach)
