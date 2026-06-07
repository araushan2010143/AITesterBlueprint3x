# task_plan.md — BLAST Phase Checklist
> Project: Test Strategy Buddy | Date: 2026-06-07

## Phase 0 — Protocol 0 (Initialization)
- [x] Initialize gemini.md (Project Constitution)
- [x] Initialize task_plan.md (this file)
- [x] Initialize findings.md
- [x] Initialize progress.md
- [x] Discovery Questions answered (5/5)
- [x] Data Schema defined in gemini.md

## Phase 1 — B: Blueprint
- [x] North Star: React app → JIRA fetch → GROQ → Test Strategy document
- [x] Integrations: JIRA Cloud API + GROQ API (openai/gpt-oss-120b)
- [x] Source of Truth: JIRA ticket (KAN-4)
- [x] Delivery: GitHub (jira-test-strategy-buddy, public) + Vercel
- [x] Template: Ecommerce Test Strategy PDF format (8 sections)
- [ ] Scaffold React + Vite + TS + Tailwind project

## Phase 2 — L: Link
- [ ] Build `/api/jira.js` — Vercel serverless JIRA proxy
- [ ] Build `/api/groq.js` — Vercel serverless GROQ proxy

## Phase 3 — A: Architect (3-Layer Build)
- [ ] Layer 1 (Architecture): SOPs in `architecture/`
- [ ] Layer 2 (Navigation): Context providers (Theme, Settings)
- [ ] Layer 3 (Tools): React components
  - [ ] Header.tsx
  - [ ] SettingsModal.tsx
  - [ ] JiraInput.tsx
  - [ ] TestStrategyOutput.tsx
  - [ ] ThemeToggle.tsx
  - [ ] App.tsx

## Phase 4 — S: Stylize
- [ ] Tailwind dark/light mode (class-based)
- [ ] Professional card layout for test strategy sections
- [ ] Loading spinners for JIRA fetch + GROQ generation
- [ ] PDF export button
- [ ] Copy-to-clipboard button

## Phase 5 — T: Trigger (Deployment)
- [ ] git init + push to GitHub (jira-test-strategy-buddy)
- [ ] Install Vercel CLI
- [ ] vercel login + vercel deploy
- [ ] Provide GitHub link + Vercel link + screenshot
