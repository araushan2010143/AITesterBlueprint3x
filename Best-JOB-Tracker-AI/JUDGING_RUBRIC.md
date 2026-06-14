# JUDGING_RUBRIC.md — Competition Scoring Criteria

> For: AI Builder Competition — Best JOB Tracker AI
> Framework: RICE-POT × B.L.A.S.T.
> Total Score: 100 points | Deadline: 15th June 2026

---

## Overview

This rubric is used to evaluate all competition entries. Each participant should self-score before submission. The judging panel scores independently; discrepancies >20 points will be reviewed with the participant.

---

## Part 1: RICE-POT Evaluation (60 points)

RICE-POT measures the quality of the AI product prompt engineering and output quality.

### R — Role Clarity (8 points)

| Score | Criteria |
|-------|----------|
| 7–8 | The AI agent has a clearly defined persona with domain expertise. The role is specific (e.g., "ATS Resume Expert") not generic ("helpful assistant"). The persona is consistent across all AI features. |
| 4–6 | The AI role is defined but occasionally breaks character or gives generic responses that don't reflect the stated expertise. |
| 1–3 | The AI has no defined role. Responses are generic and unpersonalized. |
| 0 | No AI features present. |

**Self-score checklist:**
- [ ] Resume tailoring uses "ATS Optimization Expert" persona with specific ATS rules
- [ ] Cover letter uses "Career Marketing Specialist" persona with company-specific tone
- [ ] Cold email uses "Executive Outreach Expert" persona with AIDA framework
- [ ] Interview prep uses "Technical Interview Coach" persona with STAR method

---

### I — Instructions Specificity (10 points)

| Score | Criteria |
|-------|----------|
| 9–10 | Instructions are precise, layered, and include "Do Not" rules. Multi-step decomposition is visible. AI follows formatting constraints consistently. No hallucination of credentials or fake metrics. |
| 6–8 | Instructions work correctly for happy path but edge cases (missing salary info, unknown company) produce degraded output. |
| 3–5 | Instructions are vague. AI sometimes ignores constraints or over-generates beyond specified length. |
| 0–2 | Instructions are a single line. AI output is unpredictable. |

**Self-score checklist:**
- [ ] Resume tailoring prompt includes explicit "Do NOT fabricate numbers or achievements" rule
- [ ] Cover letter prompt includes "max 3 paragraphs, 250 words" constraint
- [ ] Cold email prompt includes "max 5 lines, no buzzwords" rule
- [ ] Prompts handle missing context gracefully (no job URL → skip news section)

---

### C — Context Depth (10 points)

| Score | Criteria |
|-------|----------|
| 9–10 | Full context passed to AI: user profile + job description + company research (Tavily) + resume content. AI responses reference specific details from all sources. |
| 6–8 | 2–3 context sources used. AI references JD keywords and company name but lacks research depth. |
| 3–5 | Only JD or only resume passed. Context is shallow. Generic output. |
| 0–2 | No dynamic context. Same output regardless of company or role. |

**Self-score checklist:**
- [ ] Tavily company news injected into cover letter and cold email context
- [ ] User's target companies used to personalize dashboard and suggestions
- [ ] Full JD text (not just title) used for resume scoring
- [ ] Interview prep questions vary by company tier (FAANG vs. startup)

---

### E — Example Quality (8 points)

| Score | Criteria |
|-------|----------|
| 7–8 | Prompts use few-shot examples. Output format shown in prompt. UI displays real AI output, not placeholder text. Demo account has realistic, high-quality AI-generated content. |
| 4–6 | Some few-shot examples present. Demo has some real content but also filler data. |
| 1–3 | No examples in prompts. Demo uses lorem ipsum. |
| 0 | No demo account or all placeholder data. |

**Self-score checklist:**
- [ ] Resume tailor prompt includes example input bullet + example tailored bullet
- [ ] Cover letter prompt includes one-paragraph example in the desired style
- [ ] Demo account shows 3+ real AI-generated cover letters
- [ ] AI outputs use consistent formatting (not raw text blobs)

---

### P — Parameter Precision (8 points)

| Score | Criteria |
|-------|----------|
| 7–8 | All AI calls specify: model, max_tokens, temperature, structured output schema. Parameters are tuned per use case (low temp for ATS keywords, higher for creative cold email). Rate limiting enforced. |
| 4–6 | Default parameters used for all calls. No structured output. Works but lacks precision. |
| 1–3 | Single OpenAI call with no parameter tuning. Inconsistent output format. |
| 0 | Direct copy of OpenAI quickstart with no customization. |

**Self-score checklist:**
- [ ] Resume scoring: temperature=0.1 (deterministic scoring)
- [ ] Cover letter: temperature=0.7 (creative but controlled)
- [ ] Cold email: temperature=0.5, max_tokens=300 (concise)
- [ ] Structured output JSON schema used for keyword extraction
- [ ] Rate limiting: 20 AI calls/day per user enforced via `ai_usage` table

---

### O — Output Completeness (8 points)

| Score | Criteria |
|-------|----------|
| 7–8 | All 5+ AI features deliver complete, immediately usable output. Resume shows diff view. Cover letter is export-ready PDF. Cold email is one-click copy. Interview prep is organized and searchable. |
| 4–6 | 3–4 features work end-to-end. At least one feature lacks a delivery mechanism (shows raw text only). |
| 1–3 | 1–2 features work. Most show raw JSON or unformatted text. |
| 0 | AI features don't work or only show placeholder output. |

**Self-score checklist:**
- [ ] Resume tailor: diff view + PDF export
- [ ] Cover letter: formatted preview + PDF download
- [ ] Cold email: subject line + body + one-click copy
- [ ] Interview prep: categorized questions + STAR guidance + "mark practiced"
- [ ] Match score: visible on every Kanban card after AI analysis

---

### T — Tone Consistency (8 points)

| Score | Criteria |
|-------|----------|
| 7–8 | AI tone matches context throughout: professional (resume), warm-direct (cover letter), confident-brief (cold email), encouraging (interview prep). UI language matches product's brand voice. |
| 4–6 | Tone is mostly correct but inconsistent between features. Some outputs too formal, some too casual. |
| 1–3 | Single tone applied to all features. Doesn't match professional context. |
| 0 | No apparent tone consideration. |

**Self-score checklist:**
- [ ] Resume suggestions are direct and ATS-optimized (no fluff)
- [ ] Cover letter is warm but professional (not sycophantic)
- [ ] Cold email is confident and brief (5 lines max)
- [ ] UI copy is encouraging without being corny

---

## Part 2: B.L.A.S.T. Evaluation (40 points)

B.L.A.S.T. measures the quality of the build methodology and system design.

### B — Blueprint Quality (8 points)

| Score | Criteria |
|-------|----------|
| 7–8 | Complete PRD with problem statement, user personas, success metrics, and non-goals. Data schema defined before any code written. `LLM.md` contains all behavioral rules and architectural invariants. |
| 4–6 | PRD exists but lacks success metrics or non-goals. Data schema is incomplete or created after build started. |
| 1–3 | No formal PRD. Development started without schema definition. |
| 0 | No planning artifacts present. |

**Evidence files required:**
- `PRD.md` with all sections
- `LLM.md` with complete data schemas and behavioral rules
- `task_plan.md` with phased checklist

---

### L — Link (Connectivity) (6 points)

| Score | Criteria |
|-------|----------|
| 5–6 | All external services connected and verified before full build. Supabase RLS tested with 2 users. OAuth redirect verified in production. Extension communicates with live app. |
| 3–4 | Core services connected (Supabase, OpenAI). Some integrations (Gmail, Tavily) only tested locally. |
| 1–2 | Only Supabase connected. Other services mocked or untested. |
| 0 | Hard-coded data. No real service connections. |

**Evidence required:**
- Supabase project with real data
- OpenAI calls returning real responses (not mocked)
- Working OAuth flow

---

### A — Architecture Quality (10 points)

| Score | Criteria |
|-------|----------|
| 9–10 | Next.js 15 App Router correctly used (Server Components for data, Client Components for interactivity). RLS on all tables. Edge Functions for heavy AI. Supabase Realtime connected. dnd-kit Kanban. Clean folder structure matching ARCHITECTURE.md. |
| 6–8 | Mostly correct architecture but some anti-patterns: using Pages Router, no RLS, AI called client-side exposing API key, Client Component where Server Component would suffice. |
| 3–5 | Architecture is functional but non-standard. API key exposed in client bundle. No RLS. Single-page app without proper routing. |
| 0–2 | Architecture is prototype-level. Hardcoded data. |

**Self-score checklist:**
- [ ] Server Components fetch from Supabase directly (no API roundtrip)
- [ ] Client Components use SWR hooks only
- [ ] `OPENAI_API_KEY` not in any `NEXT_PUBLIC_*` variable
- [ ] RLS verified: user A cannot see user B's applications
- [ ] Kanban drag-and-drop uses dnd-kit (not deprecated react-beautiful-dnd)
- [ ] Realtime: status update by one browser tab reflects in another tab within 500ms

---

### S — Stylize (UI/UX Quality) (10 points)

| Score | Criteria |
|-------|----------|
| 9–10 | Professional design system (shadcn/ui + Tailwind). Dark/light mode. Mobile responsive (390px). Smooth Framer Motion animations. Empty states designed. Error states designed. Loading skeletons. Company logos shown. |
| 6–8 | Good design but some gaps: no mobile view, no empty states, no error states, missing animations. |
| 3–5 | Functional but unstyled. Default browser styling visible. No dark mode. |
| 0–2 | Prototype-level UI. No design consideration. |

**Self-score checklist:**
- [ ] Dark/light mode works across all pages
- [ ] Company logos auto-loaded from Brandfetch
- [ ] Kanban cards have skeleton loader while fetching
- [ ] Empty Kanban column shows "No applications yet + Add button"
- [ ] Error toast on AI failure (not silent error)
- [ ] Mobile: Kanban scrolls horizontally, sidebar becomes bottom nav
- [ ] Framer Motion: at least page transition + card drag animation

---

### T — Trigger (Deployment) (6 points)

| Score | Criteria |
|-------|----------|
| 5–6 | Live on Vercel with production URL. All env vars in Vercel dashboard (no secrets in code). Supabase migrations run on production DB. Browser extension loads in Chrome. Google OAuth works in production. |
| 3–4 | Deployed to Vercel but some features broken in production (works locally only). OAuth redirect URI not updated. |
| 1–2 | Not deployed or deployment fails. Only local demo available. |
| 0 | No deployment. |

**Evidence required:**
- Working Vercel URL in README.md
- Supabase project showing production data
- Extension loadable from `extension/` folder without local server

---

## Scoring Summary

| Category | Max Points | Self-Score |
|----------|------------|------------|
| **RICE-POT: Role** | 8 | /8 |
| **RICE-POT: Instructions** | 10 | /10 |
| **RICE-POT: Context** | 10 | /10 |
| **RICE-POT: Example** | 8 | /8 |
| **RICE-POT: Parameters** | 8 | /8 |
| **RICE-POT: Output** | 8 | /8 |
| **RICE-POT: Tone** | 8 | /8 |
| **B.L.A.S.T.: Blueprint** | 8 | /8 |
| **B.L.A.S.T.: Link** | 6 | /6 |
| **B.L.A.S.T.: Architecture** | 10 | /10 |
| **B.L.A.S.T.: Stylize** | 10 | /10 |
| **B.L.A.S.T.: Trigger** | 6 | /6 |
| **TOTAL** | **100** | **/100** |

---

## Prize Tiers

| Score | Result |
|-------|--------|
| 90–100 | 1st Place — ₹1000 + Certificate |
| 75–89 | 2nd Place — Certificate of Excellence |
| 60–74 | 3rd Place — Certificate of Merit |
| <60 | Participation Certificate |

---

## Submission Requirements

All submissions must include:

1. **GitHub repository link** (public) — must have `README.md`, `PRD.md`, `ARCHITECTURE.md`
2. **Live Vercel URL** — judges will test the live app
3. **2-minute demo video** (Loom or YouTube unlisted) — show all 5 AI features + Kanban + extension
4. **Self-score sheet** — fill in the scoring table above and attach to submission

Submissions without a live URL or demo video will have B.L.A.S.T.: Trigger capped at 2/6.

---

## Judging Panel

Judges will independently score using this rubric and average their scores. In case of tie, the tiebreaker is the **Context (C)** score — the depth of AI context engineering distinguishes great AI products from good ones.
