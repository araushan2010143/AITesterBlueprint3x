# findings.md — Research & Discoveries

## Competition Context
- **Prize**: ₹1000
- **Deadline**: 15th June 2026 EOD
- **Judging**: RICE-POT + B.L.A.S.T. rubric

## Stack Decisions

### Why Next.js 15 App Router?
- Server Components eliminate client-side waterfall fetches
- Parallel routes perfect for split Kanban + Analytics views
- Intercepting routes for modal-based job detail drawers
- Partial Pre-rendering (PPR) for dashboard shell

### Why Supabase over Firebase?
- Postgres SQL (relational) — job tracking is inherently relational
- Built-in Row Level Security (RLS) — multi-tenant without custom middleware
- Supabase Realtime via Postgres LISTEN/NOTIFY — status change push notifications
- Supabase Auth supports Google OAuth out-of-box
- Supabase Storage for resume/cover letter PDFs
- Edge Functions (Deno) for AI feature backends

### Why dnd-kit over react-beautiful-dnd?
- react-beautiful-dnd is deprecated (Atlassian archived it)
- dnd-kit is actively maintained, smaller bundle, works with React 19

### Why Vitest over Jest?
- Vitest is Vite-native, faster, compatible with Next.js 15's turbopack
- Same API as Jest so migration is trivial

### Why shadcn/ui over MUI/Chakra?
- Copy-paste components — no runtime CSS-in-JS overhead
- Full Tailwind integration — consistent design tokens
- Accessible (Radix UI primitives under the hood)

## API Rate Limits

| Service | Free Tier | Constraint |
|---------|-----------|------------|
| OpenAI gpt-4o-mini | 200 RPM | 20 AI calls/user/day enforced |
| Tavily Search | 1000/month | Cache results for same company |
| Gmail API | 250 quota units/sec | Batch email parsing |
| Supabase | 500MB DB, 5GB transfer | More than enough for competition |

## Key Competitor Analysis
- **Huntr** — Kanban only, no AI, no extension
- **Teal** — Good AI but slow, no browser extension
- **Simplify** — Extension only, no full dashboard
- **Our edge**: AI-powered trifecta (tailoring + cold email + prep) + real-time Kanban + extension + Gmail parser in one product

## Browser Extension Approach
- Manifest V3 (Chrome/Edge) — service worker not persistent background page
- Content script on `linkedin.com/jobs/*`, `naukri.com/job-listings/*`
- `chrome.storage.local` for user token (not localStorage — more secure for extensions)
- One message: `{action: "CAPTURE_JOB", data: {title, company, url, description}}`
- Background service worker calls `fetch` to `https://app.domain.com/api/applications`

## Supabase RLS Policies (critical)
```sql
-- applications table
CREATE POLICY "Users see own applications"
  ON applications FOR ALL
  USING (auth.uid() = user_id);

-- interviews table  
CREATE POLICY "Users see own interviews"
  ON interviews FOR ALL
  USING (auth.uid() = user_id);
```
If RLS is not enabled, any authenticated user can see all data — **this is a security critical finding**.

## Gmail OAuth Scope
- Use `https://www.googleapis.com/auth/gmail.readonly` — read-only, minimal permission
- Never store raw email content — extract structured data via OpenAI, store only structured result
- User must explicitly trigger "Parse inbox" — no background scanning

## Discoveries During Build
*(To be updated as issues are found)*
