# LLM.md — Project Constitution (Best JOB Tracker AI)

> This file is LAW. Schema changes, rules, and architecture invariants live here.
> Update ONLY when: schema changes, rule added, architecture modified.

---

## Data Schemas

### User Profile (Supabase: `profiles`)
```typescript
{
  id: uuid,                        // = auth.users.id
  email: string,
  full_name: string,
  avatar_url: string | null,
  target_role: string,             // "SDE-2", "Senior QA", etc.
  target_companies: string[],      // ["Google", "Stripe"]
  job_search_status: "active" | "passive" | "paused",
  created_at: timestamptz,
  updated_at: timestamptz
}
```

### Job Application (Supabase: `applications`)
```typescript
{
  id: uuid,
  user_id: uuid,                   // FK → profiles.id
  company: string,
  role_title: string,
  job_url: string | null,
  source: "linkedin" | "naukri" | "email" | "referral" | "manual" | "extension",
  status: "bookmarked" | "applied" | "phone_screen" | "technical" |
          "final_round" | "offer" | "rejected" | "ghosted" | "withdrawn",
  applied_at: date | null,
  deadline: date | null,
  salary_min: number | null,
  salary_max: number | null,
  salary_currency: "INR" | "USD" | "GBP",
  location: string | null,
  remote_type: "remote" | "hybrid" | "onsite",
  notes: string | null,
  ai_match_score: number | null,   // 0–100, computed by Edge Function
  resume_version: string | null,   // which resume variant was used
  cover_letter_url: string | null,
  created_at: timestamptz,
  updated_at: timestamptz
}
```

### Interview (Supabase: `interviews`)
```typescript
{
  id: uuid,
  application_id: uuid,            // FK → applications.id
  user_id: uuid,
  round_type: "phone" | "technical" | "system_design" | "hr" | "culture_fit" | "offer",
  scheduled_at: timestamptz,
  duration_minutes: number,
  interviewer_names: string[],
  platform: "zoom" | "meet" | "teams" | "phone" | "onsite",
  status: "scheduled" | "completed" | "cancelled" | "rescheduled",
  prep_notes: string | null,
  feedback_received: string | null,
  outcome: "passed" | "rejected" | "pending" | null,
  created_at: timestamptz
}
```

### AI Interaction Log (Supabase: `ai_logs`)
```typescript
{
  id: uuid,
  user_id: uuid,
  application_id: uuid | null,
  action_type: "resume_tailor" | "cover_letter" | "cold_email" | "prep_questions" | "match_score",
  prompt_tokens: number,
  completion_tokens: number,
  model: string,
  result_url: string | null,       // Supabase Storage path
  created_at: timestamptz
}
```

### Document (Supabase Storage: `documents` bucket)
```
documents/{user_id}/resumes/{slug}.pdf
documents/{user_id}/cover_letters/{application_id}.pdf
documents/{user_id}/cold_emails/{application_id}.txt
```

---

## Behavioral Rules (Invariants)

1. **Auth gate**: Every API route / Edge Function MUST verify `Authorization: Bearer <supabase_jwt>` before returning data.
2. **RLS enforced**: All Supabase tables have Row-Level Security enabled. `user_id = auth.uid()` on every policy.
3. **AI token budget**: Default `max_tokens: 1500` per OpenAI call. Resume tailor cap: 2000.
4. **No secrets in client bundle**: `OPENAI_API_KEY`, `TAVILY_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are server-only. Never in `NEXT_PUBLIC_*`.
5. **Rate limiting**: Edge Functions enforce 20 AI calls per user per day (stored in Redis/Supabase `ai_usage` table).
6. **Extension CSP**: Browser extension only reads DOM from `linkedin.com`, `naukri.com`, `wellfound.com`. No other domains.
7. **One-click apply**: Extension saves job data via `POST /api/applications` with source=extension. Never auto-submits.
8. **Supabase Realtime**: `applications` table subscribed for status changes. Push Notification via Service Worker.
9. **Deployment**: Production = Vercel (main branch). Preview = Vercel PR previews. DB migrations via Supabase CLI only.
10. **No `.env` in git**: `.env.local` gitignored. CI secrets in Vercel dashboard.

---

## Architecture Invariants

- **Framework**: Next.js 15 App Router — no Pages Router.
- **Data fetching**: Server Components fetch directly via `supabase-js` (server client). Client Components use SWR.
- **Styling**: TailwindCSS v3 + shadcn/ui. No inline styles. No CSS Modules.
- **Animation**: Framer Motion for page transitions and Kanban drag-and-drop.
- **Testing**: Vitest (unit) + Playwright (E2E). No Jest.
- **State**: Zustand for global UI state. No Redux, no Context for complex state.
- **Forms**: react-hook-form + Zod validation. No Formik.
- **Email parsing**: Gmail OAuth (read-only scope). Parse via OpenAI structured output. Never store raw emails.
- **Kanban board**: `@dnd-kit/sortable` for drag-and-drop. Status = column. Application = card.

---

## Maintenance Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-13 | Initial schema defined | Project kickoff |
