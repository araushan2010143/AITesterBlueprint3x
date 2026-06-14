# PRD — Best JOB Tracker AI
**Version**: 1.0 | **Date**: 2026-06-13 | **Author**: Abhishek Raushan

---

## 1. Executive Summary

**Best JOB Tracker AI** is an AI-powered Career Operating System that transforms chaotic job searching into a systematic, data-driven process. It combines a visual Kanban tracker, AI document generation, Gmail inbox parsing, and a browser extension into one unified platform — eliminating the spreadsheet/sticky-note chaos that kills 80% of job searches before they reach the offer stage.

**Tagline**: *"From application chaos to offer clarity — in one dashboard."*

---

## 2. Problem Statement

### The Pain Points (Validated)
1. **Tracking chaos**: Job seekers manage 20–50 applications across spreadsheets, sticky notes, and memory. 40% forget to follow up.
2. **Document debt**: Each application needs a tailored resume + cover letter. Manual tailoring takes 45–90 min per application.
3. **Ghosting spiral**: No visibility into which stage an application is stuck. Candidates don't know when to follow up vs. move on.
4. **Cold email paralysis**: Most candidates don't reach out to hiring managers because writing a cold email is daunting.
5. **Interview unprep**: Companies prep their questions in advance. Candidates wing it. AI can level the playing field.

### The Cost
- Average job search: 5 months
- Time wasted on tracking/admin: ~8 hours/week
- Missed follow-ups → ~30% of potential offers lost

---

## 3. Target Users

| Persona | Description |
|---------|-------------|
| **Active Seeker** | Applying to 5–20 jobs/week. Needs speed + organization |
| **Passive Seeker** | Employed, exploring. Needs stealth tracking + signal vs. noise |
| **Career Switcher** | Changing domains. Needs AI gap analysis + skill match scoring |
| **Fresh Graduate** | First job hunt. Needs guidance + templates + interview prep |

---

## 4. North Star Metric

**Weekly Active Applications Tracked** (WAT) — an active user has ≥3 applications updated in the past 7 days.

Target: 60% of signups become Weekly Active in first month.

---

## 5. Features

### 5.1 Core — Visual Job Tracker (Kanban)

**Columns (Status)**:
```
Bookmarked → Applied → Phone Screen → Technical → Final Round → Offer → Rejected/Ghosted
```

**Card Data**:
- Company logo (auto-fetched from Clearbit/Brandfetch)
- Role title + salary range
- Applied date + days since last update
- AI match score badge (0–100)
- Quick action buttons: Add note / Schedule interview / Generate email

**Features**:
- Drag-and-drop between columns (dnd-kit)
- Swimlane view (group by company, role type, or source)
- Filter/search by status, company, salary, location
- Sort by applied date, AI score, deadline
- Bulk move (select multiple → drag to new status)

### 5.2 One-Click Browser Extension

**Supported Sites**: LinkedIn, Naukri, Wellfound, Indeed, Glassdoor

**Behavior**:
- Extension button appears on job listing pages
- One click captures: title, company, URL, description, salary, location
- Sends to dashboard via API (source=extension)
- Shows toast notification with link to newly created card

**Architecture**: Manifest V3 Chrome Extension
- Content script parses job DOM
- Background service worker POSTs to `/api/applications`
- Popup shows last 5 captured jobs

### 5.3 AI Resume Tailoring

**Input**: User's base resume (PDF/text) + job description
**Output**: Tailored resume with highlighted changes (diff view)

**Process**:
1. Extract JD keywords via GPT-4o-mini (structured output)
2. Score existing resume against JD (0–100 match score)
3. Suggest specific bullet point rewrites
4. Generate complete tailored version
5. Export as PDF (react-pdf)

**Prompt (RICE-POT)**:
- Role: Senior ATS Optimization Expert
- Instructions: Match keywords, quantify achievements, maintain authenticity
- Context: JD + current resume
- Parameters: ATS-friendly format, no fabrication
- Output: Diff format — old bullet → new bullet

### 5.4 AI Cover Letter Generator

**Input**: Job description + company context + user profile
**Output**: 3-paragraph personalized cover letter

**Sections**:
1. Opening hook — references specific company achievement/news (Tavily search)
2. Skills match — maps candidate's top 3 achievements to JD requirements
3. Closing — specific ask + cultural fit

**Personalization signals**: Company news (Tavily), Glassdoor rating (if available), team size

### 5.5 AI Cold Email Composer

**Input**: Target role + company + hiring manager name (optional)
**Output**: 5-line cold email (the "AIDA" format)

**Template Structure**:
```
Line 1: Specific compliment about company (Tavily-sourced)
Line 2: Who you are in one sentence
Line 3: Your most relevant achievement (quantified)
Line 4: Specific ask (30-min call, not "I'd love to connect")
Line 5: Easy out ("No pressure if not the right fit")
```

### 5.6 Gmail Inbox Parser

**Auth**: Google OAuth (readonly scope)
**Trigger**: User clicks "Sync Gmail" button

**Actions**:
1. Fetch emails from last 30 days matching: `subject:(interview OR application OR offer OR rejection)`
2. Send email subjects + senders to OpenAI for structured extraction
3. Update application statuses automatically
4. Flag new recruiter outreach for review

**Privacy**: Raw email body never stored. Only extracted metadata saved.

### 5.7 Interview Prep Assistant

**Input**: Company + role + interview round type
**Output**: 20 likely questions with model answers (STAR format)

**Question Types**:
- Behavioral (STAR format)
- Technical (based on JD skills)
- System Design (for senior roles)
- Culture Fit (based on Glassdoor reviews)

### 5.8 Analytics Dashboard

**Metrics**:
- Applications funnel (Bookmarked → Offer conversion)
- Response rate by source (LinkedIn vs. Naukri vs. Referral)
- Average time-in-stage per company tier
- AI match score vs. interview rate correlation
- Weekly application velocity

**Visualizations**: Recharts — funnel chart, line chart (velocity), bar chart (source breakdown)

### 5.9 Deadline & Follow-Up Engine

- Set follow-up reminders per application
- Auto-suggest "follow up" when application > 14 days in Applied with no update
- Browser notification + email digest (Supabase Edge Function + Resend API)

---

## 6. User Stories

### Epic 1: Tracking
- `US-001` As a job seeker, I can add a job application in <30 seconds so I don't lose track
- `US-002` As a job seeker, I can drag-and-drop an application to a new status so updates feel natural
- `US-003` As a job seeker, I can capture a job from LinkedIn in one click so I don't lose the listing

### Epic 2: AI Documents
- `US-004` As a job seeker, I can upload my resume and get a tailored version for a specific JD in <2 min
- `US-005` As a job seeker, I can generate a personalized cover letter with one click
- `US-006` As a job seeker, I can compose a cold email that references real company news

### Epic 3: Intelligence
- `US-007` As a job seeker, I can see my overall job search funnel to identify where I'm losing
- `US-008` As a job seeker, I can sync my Gmail to auto-update application statuses
- `US-009` As a job seeker, I get prep questions specific to my upcoming interview company + round

### Epic 4: Collaboration
- `US-010` As a job seeker, I can share my Kanban board (read-only) with a mentor or career coach

---

## 7. Technical Requirements

| Requirement | Specification |
|-------------|--------------|
| Auth | Supabase Auth — Email/Password + Google OAuth |
| Database | Supabase Postgres with RLS |
| AI | OpenAI gpt-4o-mini (default), gpt-4o for complex tasks |
| Search | Tavily API for company intelligence |
| Storage | Supabase Storage (resumes, cover letters) |
| Realtime | Supabase Realtime (status change notifications) |
| Extension | Chrome Manifest V3, Firefox WebExtension |
| Email | Resend API for notification emails |
| Deployment | Vercel (Next.js) + Supabase Cloud |

---

## 8. Non-Goals (v1.0)

- No mobile app (PWA only)
- No team/recruiter features
- No automated job applications (Roo-based apply is ethical risk)
- No LinkedIn scraping (ToS violation)
- No payment/subscription in competition build

---

## 9. Success Metrics

| Metric | Target |
|--------|--------|
| Time to first application tracked | <60 seconds |
| AI resume tailoring satisfaction | >4/5 rating |
| Extension one-click capture success rate | >95% |
| Dashboard load time (P95) | <1.5 seconds |
| Competition judging score | >85/100 |

---

## 10. Competition Positioning

### Why This Wins

| RICE-POT Criterion | Our Advantage |
|-------------------|---------------|
| **Role** (relevance) | Directly solves a universal pain — every developer has job-hunted |
| **Instructions** (clarity) | Dead-simple UX: Kanban = instant mental model |
| **Context** (depth) | AI understands the full application context (JD + resume + company) |
| **Example** (proof) | Working demo with real data, not a slideshow |
| **Parameters** (quality) | Production stack (Next.js 15 + Supabase), not a prototype |
| **Output** (completeness) | 8 integrated features, not a single-trick app |
| **Tone** (impact) | Solves real pain with measurable ROI (time saved per application) |
