# MILESTONES.md — Implementation Plan

## Overview

6 milestones from scaffold to deployed production. Each milestone = a GitHub Milestone.
Each GitHub Issue is listed with assignee (solo), labels, and acceptance criteria.

**Total estimated time**: 20 hours (competition deadline: 15th June 2026 EOD)

---

## Milestone 1: Foundation (M1) — 4 hours

**Goal**: Working Next.js 15 app with auth, Supabase connected, basic shell.

### GitHub Issues

#### Issue #1: Scaffold Next.js 15 + Configure TailwindCSS + shadcn/ui
```
Labels: setup, frontend
Estimate: 45 min

Steps:
  npx create-next-app@latest best-job-tracker-ai \
    --typescript --tailwind --app --src-dir false
  npx shadcn-ui@latest init
  
Components to install:
  button, card, dialog, dropdown-menu, input, label,
  select, separator, sheet, skeleton, badge, toast, avatar

Acceptance criteria:
  - [ ] `npm run dev` starts without errors
  - [ ] shadcn/ui components render correctly
  - [ ] Dark/light mode toggle works
  - [ ] Framer Motion installed: npm install framer-motion
```

#### Issue #2: Supabase Project Setup + Schema Migration
```
Labels: database, backend
Estimate: 60 min

Steps:
  1. Create Supabase project at supabase.com
  2. Copy URL + anon key to .env.local
  3. Create supabase/migrations/001_initial_schema.sql (see ARCHITECTURE.md)
  4. npx supabase db push
  5. Enable Realtime on applications table in Supabase dashboard

Acceptance criteria:
  - [ ] All tables created (profiles, applications, interviews, ai_usage)
  - [ ] RLS policies active (test: unauthenticated SELECT returns 0 rows)
  - [ ] Realtime enabled on applications table
```

#### Issue #3: Authentication (Supabase Auth + Google OAuth)
```
Labels: auth, frontend, backend
Estimate: 60 min

Files to create:
  - app/(auth)/login/page.tsx
  - app/(auth)/callback/route.ts
  - lib/supabase/client.ts
  - lib/supabase/server.ts
  - middleware.ts (session refresh)
  - components/layout/Header.tsx (shows avatar when logged in)

Acceptance criteria:
  - [ ] Email/password signup works
  - [ ] Google OAuth login works
  - [ ] Session persists on page refresh
  - [ ] Unauthenticated user redirected to /login
  - [ ] Profile auto-created on signup (Supabase trigger)
```

#### Issue #4: Dashboard Shell + Sidebar Navigation
```
Labels: frontend, layout
Estimate: 45 min

Files to create:
  - app/(dashboard)/layout.tsx
  - components/layout/Sidebar.tsx
  - components/layout/ThemeToggle.tsx

Navigation items:
  - /tracker (Kanban Board) — default
  - /analytics (Analytics)
  - /applications (List View)
  - /ai/resume (Resume Tailoring)
  - /ai/cover-letter
  - /ai/cold-email
  - /ai/prep (Interview Prep)
  - /settings

Acceptance criteria:
  - [ ] Sidebar collapses on mobile
  - [ ] Active route highlighted
  - [ ] Dark mode works throughout
```

---

## Milestone 2: Core Tracker (M2) — 4 hours

**Goal**: Fully functional Kanban board with CRUD.

### GitHub Issues

#### Issue #5: Applications API (CRUD)
```
Labels: backend, api
Estimate: 60 min

Files:
  - app/api/applications/route.ts         (GET list, POST create)
  - app/api/applications/[id]/route.ts    (GET, PATCH, DELETE)
  - types/index.ts                        (Application, Interview types)

GET /api/applications
  - Query params: status, search, sort, limit, offset
  - Returns: { data: Application[], total: number }

POST /api/applications
  - Body: { company, role_title, job_url?, status?, notes? }
  - Returns: { data: Application }

PATCH /api/applications/:id
  - Body: Partial<Application>
  - Returns: { data: Application }

Acceptance criteria:
  - [ ] All CRUD operations work
  - [ ] RLS enforced (users only see own data — verified with 2 test accounts)
  - [ ] Input validated with Zod
```

#### Issue #6: Kanban Board UI (dnd-kit)
```
Labels: frontend, kanban
Estimate: 90 min

npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

Files:
  - components/kanban/KanbanBoard.tsx
  - components/kanban/KanbanColumn.tsx
  - components/kanban/ApplicationCard.tsx
  - app/(dashboard)/tracker/page.tsx
  - hooks/useApplications.ts  (SWR)
  - hooks/useRealtime.ts      (Supabase Realtime subscription)

Card displays:
  - Company name + logo (Brandfetch)
  - Role title
  - Applied date (or "Not applied yet")
  - AI match score badge (if computed)
  - Days in current stage
  - Source icon (LinkedIn, Naukri, etc.)

Acceptance criteria:
  - [ ] Drag card from one column to another → status updates via PATCH
  - [ ] New card appears via Realtime without page refresh
  - [ ] Card opens detail sheet on click
  - [ ] Framer Motion animation on drag
```

#### Issue #7: Add Application Modal
```
Labels: frontend
Estimate: 45 min

File: components/kanban/AddApplicationModal.tsx

Form fields: company, role_title, job_url, status, salary, location, remote_type, deadline, notes

Acceptance criteria:
  - [ ] Form validates with Zod
  - [ ] Submit creates application via POST /api/applications
  - [ ] New card appears on Kanban immediately (optimistic update)
  - [ ] Keyboard shortcut: Cmd+K opens modal
```

#### Issue #8: Application Detail Sheet
```
Labels: frontend
Estimate: 45 min

Shows: all application fields + interview timeline + AI action buttons

AI action buttons:
  - "Tailor Resume" → /ai/resume?applicationId=xxx
  - "Generate Cover Letter" → /ai/cover-letter?applicationId=xxx
  - "Compose Cold Email" → /ai/cold-email?applicationId=xxx
  - "Prep for Interview" → /ai/prep?applicationId=xxx

Acceptance criteria:
  - [ ] Opens as slide-over sheet (shadcn/ui Sheet)
  - [ ] Inline edit for notes field
  - [ ] Interview timeline visible
  - [ ] Status can be changed from detail view
```

---

## Milestone 3: AI Features (M3) — 4 hours

**Goal**: All 4 AI features working end-to-end.

### GitHub Issues

#### Issue #9: AI Resume Tailoring
```
Labels: ai, backend, frontend
Estimate: 90 min

API: POST /api/ai/tailor
Body: { applicationId: string, resumeText: string }
Returns: { score: number, keywords: string[], diffHtml: string, tailoredText: string }

OpenAI calls (sequential):
  1. Extract JD keywords → structured output { must_have: [], nice_to_have: [] }
  2. Score resume: "Rate this resume against the JD from 0-100. Return JSON { score, gaps[] }"
  3. Tailor bullets: "Rewrite each bullet to match JD. Return JSON { original: string, tailored: string }[]"

Files:
  - app/api/ai/tailor/route.ts
  - components/ai/ResumeDiff.tsx    (before/after diff UI)
  - app/(dashboard)/ai/resume/page.tsx

Acceptance criteria:
  - [ ] AI returns tailored resume in <10 seconds
  - [ ] Diff shows highlighted changes
  - [ ] Match score badge appears on application card after tailoring
  - [ ] Rate limit enforced (20/day per user via ai_usage table)
```

#### Issue #10: AI Cover Letter Generator
```
Labels: ai, backend, frontend
Estimate: 60 min

API: POST /api/ai/cover-letter
Body: { applicationId: string }
Returns: { coverLetter: string, companyNews: string[] }

Process:
  1. Fetch company news via Tavily API
  2. Build cover letter prompt with company context
  3. Generate 3-paragraph letter via OpenAI

File: app/api/ai/cover-letter/route.ts

Acceptance criteria:
  - [ ] Cover letter references real company news
  - [ ] Export as PDF (react-pdf)
  - [ ] Saved to Supabase Storage
```

#### Issue #11: Cold Email Composer
```
Labels: ai, backend, frontend
Estimate: 45 min

API: POST /api/ai/cold-email
Body: { applicationId: string, hiringManagerName?: string }
Returns: { subject: string, body: string }

5-line AIDA format:
  1. Company-specific compliment (Tavily)
  2. Who you are
  3. Best achievement (quantified)
  4. Specific ask
  5. Easy out

File: app/api/ai/cold-email/route.ts

Acceptance criteria:
  - [ ] Email is 5 lines max
  - [ ] One-click copy to clipboard
  - [ ] "Regenerate" button for variety
```

#### Issue #12: Interview Prep Assistant
```
Labels: ai, backend, frontend
Estimate: 45 min

API: POST /api/ai/prep
Body: { applicationId: string, roundType: string }
Returns: { questions: { question: string, guidanceNotes: string, starExample: string }[] }

20 questions per session split by type:
  - 5 behavioral (STAR format)
  - 5 technical (based on JD skills)
  - 5 system design (if senior role)
  - 5 company/culture specific (Tavily-powered)

File: app/api/ai/prep/route.ts

Acceptance criteria:
  - [ ] Questions are specific to company + role (not generic)
  - [ ] STAR format shown for behavioral questions
  - [ ] User can mark questions as "practiced"
```

---

## Milestone 4: Integrations (M4) — 3 hours

**Goal**: Browser extension + Gmail sync working.

### GitHub Issues

#### Issue #13: Chrome Browser Extension (Manifest V3)
```
Labels: extension
Estimate: 90 min

Files:
  extension/
  ├── manifest.json
  ├── background.js   (service worker)
  ├── content.js      (DOM parser)
  ├── popup.html
  └── popup.js

Supported job sites:
  - linkedin.com/jobs/view/*
  - naukri.com/job-listings/*
  - wellfound.com/jobs/*

Content script selectors (per site):
  LinkedIn: h1.t-24, .jobs-unified-top-card__company-name, .jobs-description
  Naukri:   .jd-header-title, .jd-header-comp-name, .job-desc

manifest.json:
{
  "manifest_version": 3,
  "name": "Best JOB Tracker AI",
  "version": "1.0.0",
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["https://best-job-tracker-ai.vercel.app/*"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{ "matches": ["*://www.linkedin.com/jobs/*", "*://www.naukri.com/*"], "js": ["content.js"] }],
  "action": { "default_popup": "popup.html" }
}

Acceptance criteria:
  - [ ] Extension loads in Chrome (chrome://extensions)
  - [ ] Capture button appears on LinkedIn job pages
  - [ ] Captured job appears in dashboard Kanban (Bookmarked column)
  - [ ] Toast confirmation in popup
```

#### Issue #14: Gmail Inbox Parser
```
Labels: integrations, ai
Estimate: 90 min

OAuth flow:
  1. User clicks "Connect Gmail" in settings
  2. Google OAuth popup (scope: gmail.readonly)
  3. Token stored in Supabase Auth session metadata

API: POST /api/gmail/sync
  1. Fetch Gmail messages (last 30 days, filter: interview|application|offer|rejection)
  2. Batch subjects + senders → OpenAI structured extraction
  3. Update applications table

Privacy safeguard: Only email subject + sender name sent to OpenAI. Body never stored or sent.

Acceptance criteria:
  - [ ] Gmail OAuth connects without error
  - [ ] At least 3 application statuses auto-updated after sync
  - [ ] User sees diff: "Updated X applications from Gmail"
  - [ ] Works without Gmail connected (graceful degradation)
```

---

## Milestone 5: Polish & Analytics (M5) — 2 hours

**Goal**: Analytics dashboard, mobile responsive, animations.

### GitHub Issues

#### Issue #15: Analytics Dashboard
```
Labels: frontend, analytics
Estimate: 60 min

npm install recharts

Charts:
  1. Applications Funnel (Bookmarked → Offer) — FunnelChart
  2. Weekly Velocity (applications/week) — LineChart
  3. Source Breakdown (LinkedIn vs Naukri vs Referral) — PieChart
  4. Response Rate by Company Tier — BarChart
  5. Average time in stage — BarChart

File: app/(dashboard)/analytics/page.tsx

Acceptance criteria:
  - [ ] All charts render with real user data
  - [ ] Charts are interactive (hover tooltips)
  - [ ] Empty state (if <3 applications): shows onboarding prompt
```

#### Issue #16: Mobile Responsive + Framer Motion
```
Labels: frontend, ux
Estimate: 60 min

Mobile breakpoints:
  - Kanban: horizontal scroll on mobile
  - Sidebar: bottom navigation on mobile (<768px)
  - Cards: full-width stack view on mobile

Framer Motion animations:
  - Page transitions (layout animation)
  - Card drag animation
  - Modal open/close (spring physics)
  - AI loading skeleton pulse

Acceptance criteria:
  - [ ] App usable on iPhone 13 screen width (390px)
  - [ ] No layout breaks at 768px or 1024px
  - [ ] Smooth transitions between pages
```

---

## Milestone 6: Deploy & Submit (M6) — 3 hours

**Goal**: Live on Vercel, submitted to competition.

### GitHub Issues

#### Issue #17: Vercel Deployment
```
Labels: devops, deployment
Estimate: 60 min

Steps: See DEPLOYMENT.md for full guide

Acceptance criteria:
  - [ ] `https://best-job-tracker-ai.vercel.app` is live
  - [ ] All env vars set in Vercel dashboard
  - [ ] Supabase migrations run on prod DB
  - [ ] Google OAuth redirect URI updated to production URL
  - [ ] No build errors in Vercel deployment logs
```

#### Issue #18: Demo Account + Seed Data
```
Labels: qa, demo
Estimate: 30 min

Create demo account: demo@bestjobtracker.ai
Seed 15 applications across all statuses
Seed 3 interviews
Pre-run AI tailor on 2 applications (so demo shows real AI output)

Acceptance criteria:
  - [ ] Demo account login works without entering credentials (demo button)
  - [ ] Kanban has realistic data covering all columns
  - [ ] Analytics charts are populated
```

#### Issue #19: Final QA + Competition Submission
```
Labels: qa, submission
Estimate: 90 min

QA checklist:
  - [ ] Auth: signup, login, Google OAuth, logout
  - [ ] CRUD: add, edit, drag, delete application
  - [ ] AI: resume tailor, cover letter, cold email, prep (each once)
  - [ ] Extension: capture from LinkedIn
  - [ ] Gmail: sync test with demo account
  - [ ] Analytics: all charts render
  - [ ] Mobile: test on 390px width
  - [ ] Dark mode: full walkthrough
  - [ ] Rate limiting: verify 20/day cap works

Submission artifacts:
  - [ ] GitHub repo link
  - [ ] Vercel live URL
  - [ ] 2-min demo video (Loom)
  - [ ] README.md with all feature descriptions
```

---

## Summary Table

| Milestone | Issues | Hours | Outcome |
|-----------|--------|-------|---------|
| M1: Foundation | #1–4 | 4h | Auth + shell |
| M2: Core Tracker | #5–8 | 4h | Kanban CRUD |
| M3: AI Features | #9–12 | 4h | All AI working |
| M4: Integrations | #13–14 | 3h | Extension + Gmail |
| M5: Polish | #15–16 | 2h | Analytics + mobile |
| M6: Deploy | #17–19 | 3h | Live + submitted |
| **Total** | **19 issues** | **20h** | **Competition ready** |
