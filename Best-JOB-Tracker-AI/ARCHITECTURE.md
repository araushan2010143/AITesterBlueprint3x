# ARCHITECTURE.md — Best JOB Tracker AI

## Stack Overview

```
┌────────────────────────────────────────────────────┐
│                  FRONTEND (Vercel)                  │
│  Next.js 15 App Router + TypeScript                │
│  TailwindCSS + shadcn/ui + Framer Motion           │
│  SWR (client fetching) + Zustand (global state)    │
└───────────────────┬────────────────────────────────┘
                    │ HTTPS / WebSocket
┌───────────────────▼────────────────────────────────┐
│             BACKEND (Supabase + Vercel)             │
│  Next.js API Routes (/api/*)                       │
│  Supabase Edge Functions (AI heavy tasks)          │
│  Supabase Auth (JWT + Google OAuth)                │
│  Supabase Postgres + RLS                           │
│  Supabase Realtime (status updates)                │
│  Supabase Storage (PDF documents)                  │
└───────────────────┬────────────────────────────────┘
                    │
┌───────────────────▼────────────────────────────────┐
│              EXTERNAL SERVICES                      │
│  OpenAI API (gpt-4o-mini) — AI features            │
│  Tavily API — Company intelligence                 │
│  Google OAuth — Gmail read + SSO                   │
│  Resend API — Email notifications                  │
│  Brandfetch API — Company logos                    │
└────────────────────────────────────────────────────┘
```

---

## Folder Structure

```
Best-JOB-Tracker-AI/
├── app/                          # Next.js 15 App Router
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── callback/route.ts     # Supabase OAuth callback
│   ├── (dashboard)/
│   │   ├── layout.tsx            # Dashboard shell (sidebar + header)
│   │   ├── page.tsx              # Dashboard home → redirect to /tracker
│   │   ├── tracker/
│   │   │   └── page.tsx          # Kanban board
│   │   ├── analytics/
│   │   │   └── page.tsx          # Charts and funnel
│   │   ├── applications/
│   │   │   ├── page.tsx          # List view (table)
│   │   │   └── [id]/
│   │   │       └── page.tsx      # Application detail + AI actions
│   │   ├── ai/
│   │   │   ├── resume/page.tsx   # Resume tailoring tool
│   │   │   ├── cover-letter/page.tsx
│   │   │   ├── cold-email/page.tsx
│   │   │   └── prep/page.tsx     # Interview prep
│   │   └── settings/
│   │       └── page.tsx          # Profile, integrations, API keys
│   └── api/
│       ├── applications/
│       │   ├── route.ts          # GET (list) + POST (create)
│       │   └── [id]/
│       │       └── route.ts      # GET, PATCH, DELETE
│       ├── ai/
│       │   ├── tailor/route.ts   # POST: resume tailoring
│       │   ├── cover-letter/route.ts
│       │   ├── cold-email/route.ts
│       │   └── prep/route.ts     # POST: interview prep questions
│       ├── gmail/
│       │   └── sync/route.ts     # POST: trigger Gmail sync
│       └── webhooks/
│           └── realtime/route.ts # Supabase webhook handler
│
├── components/
│   ├── ui/                       # shadcn/ui components (generated)
│   ├── kanban/
│   │   ├── KanbanBoard.tsx       # Main board with dnd-kit
│   │   ├── KanbanColumn.tsx      # Droppable column
│   │   ├── ApplicationCard.tsx   # Draggable card
│   │   └── AddApplicationModal.tsx
│   ├── ai/
│   │   ├── ResumeDiff.tsx        # Before/after resume diff view
│   │   ├── AIActionPanel.tsx     # Floating AI actions on card
│   │   └── CoverLetterPreview.tsx
│   ├── analytics/
│   │   ├── FunnelChart.tsx
│   │   ├── VelocityChart.tsx
│   │   └── SourceBreakdown.tsx
│   └── layout/
│       ├── Sidebar.tsx
│       ├── Header.tsx
│       └── ThemeToggle.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   ├── server.ts             # Server Supabase client (cookies)
│   │   └── middleware.ts         # Auth middleware (refreshes session)
│   ├── openai.ts                 # OpenAI client + helper functions
│   ├── tavily.ts                 # Tavily search client
│   └── utils.ts                  # cn(), formatDate(), etc.
│
├── store/
│   └── useAppStore.ts            # Zustand store (UI state, filters)
│
├── hooks/
│   ├── useApplications.ts        # SWR hook for applications list
│   ├── useRealtime.ts            # Supabase Realtime subscription
│   └── useAIUsage.ts             # Rate limit checker
│
├── types/
│   └── index.ts                  # All TypeScript types (matches LLM.md schemas)
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_rls_policies.sql
│   │   └── 003_indexes.sql
│   └── functions/
│       ├── ai-tailor/index.ts    # Edge Function: heavy AI processing
│       └── gmail-parser/index.ts # Edge Function: Gmail batch parsing
│
├── extension/                    # Browser Extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js             # Service Worker
│   ├── content.js                # DOM parser for job sites
│   ├── popup.html
│   └── popup.js
│
├── .env.local                    # Local secrets (gitignored)
├── .env.example                  # Template (committed to git)
├── next.config.ts
├── tailwind.config.ts
├── components.json               # shadcn/ui config
└── package.json
```

---

## Data Flow

### Happy Path: Extension Capture → Kanban Card

```
1. User visits linkedin.com/jobs/view/12345
2. Content script (content.js) detects job listing DOM
3. User clicks extension popup "Capture Job" button
4. popup.js sends message to background.js
5. background.js POSTs to https://app.domain.com/api/applications
   Headers: { Authorization: Bearer <supabase_jwt> }
   Body: { company, role_title, job_url, description, source: "extension" }
6. /api/applications/route.ts validates JWT → inserts into Supabase
7. Supabase Realtime broadcasts INSERT event to subscribed client
8. useRealtime hook receives event → Zustand store updates
9. KanbanBoard re-renders with new card in "Bookmarked" column
10. User sees toast: "Captured: Senior QA at Stripe ✓"
```

### AI Resume Tailoring Flow

```
1. User opens application card → clicks "Tailor Resume"
2. Client POSTs to /api/ai/tailor with { applicationId, resumeText }
3. Route handler:
   a. Checks AI usage quota (≤20/day)
   b. Fetches job description from applications table
   c. Calls OpenAI: extract JD keywords (structured output)
   d. Calls OpenAI: score resume vs JD (0-100)
   e. Calls OpenAI: generate tailored bullets (diff format)
4. Returns { score, keywords, tailoredBullets, diffHtml }
5. ResumeDiff component renders before/after view
6. User clicks "Export PDF" → react-pdf generates download
7. Resume version saved to Supabase Storage
```

### Gmail Sync Flow

```
1. User clicks "Sync Gmail" in settings
2. Triggers Google OAuth popup (readonly scope)
3. Access token stored in Supabase Auth session
4. POST /api/gmail/sync
5. Server fetches emails from Gmail API (last 30 days)
6. Subjects + senders sent to OpenAI structured output:
   { company, status_update, next_action, confidence }
7. Applications table updated via Supabase upsert
8. User sees confirmation: "Updated 7 applications from Gmail"
```

---

## Supabase Schema (Full DDL)

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  target_role TEXT,
  target_companies TEXT[] DEFAULT '{}',
  job_search_status TEXT DEFAULT 'active' CHECK (job_search_status IN ('active','passive','paused')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Applications
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  role_title TEXT NOT NULL,
  job_url TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('linkedin','naukri','email','referral','manual','extension')),
  status TEXT DEFAULT 'bookmarked' CHECK (status IN (
    'bookmarked','applied','phone_screen','technical','final_round','offer','rejected','ghosted','withdrawn'
  )),
  applied_at DATE,
  deadline DATE,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT DEFAULT 'INR' CHECK (salary_currency IN ('INR','USD','GBP')),
  location TEXT,
  remote_type TEXT DEFAULT 'hybrid' CHECK (remote_type IN ('remote','hybrid','onsite')),
  notes TEXT,
  ai_match_score INTEGER CHECK (ai_match_score BETWEEN 0 AND 100),
  resume_version TEXT,
  cover_letter_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Interviews
CREATE TABLE interviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  round_type TEXT NOT NULL CHECK (round_type IN ('phone','technical','system_design','hr','culture_fit','offer')),
  scheduled_at TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 60,
  interviewer_names TEXT[] DEFAULT '{}',
  platform TEXT DEFAULT 'zoom' CHECK (platform IN ('zoom','meet','teams','phone','onsite')),
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','rescheduled')),
  prep_notes TEXT,
  feedback_received TEXT,
  outcome TEXT CHECK (outcome IN ('passed','rejected','pending')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Usage Tracking
CREATE TABLE ai_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('resume_tailor','cover_letter','cold_email','prep_questions','match_score')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER DEFAULT 1,
  UNIQUE(user_id, action_type, date)
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users manage own profile" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users manage own applications" ON applications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own interviews" ON interviews FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own AI usage" ON ai_usage FOR ALL USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_applications_user_id ON applications(user_id);
CREATE INDEX idx_applications_status ON applications(user_id, status);
CREATE INDEX idx_interviews_application_id ON interviews(application_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## Next.js 15 Key Configuration

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  experimental: {
    ppr: true,                  // Partial Pre-rendering
    optimisticClientCache: true,
  },
  images: {
    domains: ['asset.brandfetch.io', 'lh3.googleusercontent.com'],
  },
};

export default config;
```

---

## Environment Variables

```bash
# .env.example — commit this
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # server-only
OPENAI_API_KEY=sk-...                            # server-only
TAVILY_API_KEY=tvly-...                          # server-only
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
RESEND_API_KEY=re_...                            # server-only
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

---

## Performance Targets

| Metric | Target | Strategy |
|--------|--------|----------|
| LCP | <1.5s | Server Components + Supabase edge network |
| CLS | <0.1 | Skeleton loaders for Kanban cards |
| FID | <100ms | No blocking JS on initial load |
| AI response | <3s | Streaming with `ReadableStream` |
| Extension capture | <500ms | Pre-fetched auth token |
| Realtime latency | <200ms | Supabase Realtime (WebSocket) |
