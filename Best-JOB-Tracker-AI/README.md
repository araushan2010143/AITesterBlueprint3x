# Best JOB Tracker AI

**Your AI Career Operating System — From Application Chaos to Offer Clarity**

> Built for the AI Builder Competition | Deadline: 15th June 2026 | Prize: ₹1000

---

## What is Best JOB Tracker AI?

Best JOB Tracker AI is a full-stack, production-ready Career Operating System that brings AI superpowers to your job search. No more spreadsheets. No more forgotten follow-ups. No more generic cover letters.

**One dashboard to track every application. One AI to win every interview.**

---

## Live Demo

> **[https://best-job-tracker-ai.vercel.app](https://best-job-tracker-ai.vercel.app)**
> 
> Login with Google — no setup required. Demo account available.

---

## Features at a Glance

| Feature | Description |
|---------|-------------|
| **Visual Kanban Tracker** | Drag-and-drop applications through 8 stages from Bookmarked to Offer |
| **Browser Extension** | One-click job capture from LinkedIn, Naukri, Wellfound |
| **AI Resume Tailoring** | Upload your resume + JD → get a tailored version with diff view in 30s |
| **AI Cover Letter** | Personalized 3-paragraph letter with real company news (Tavily-powered) |
| **Cold Email Composer** | 5-line AIDA cold emails that get replies |
| **Gmail Inbox Parser** | Sync your inbox → auto-update application statuses |
| **Interview Prep** | Company-specific prep questions in STAR format |
| **Analytics Dashboard** | Funnel analysis, response rates, velocity tracking |

---

## Tech Stack

```
Frontend:    Next.js 15 (App Router) + TypeScript + TailwindCSS + shadcn/ui + Framer Motion
Backend:     Supabase (Auth + Postgres + Storage + Realtime + Edge Functions)
AI:          OpenAI gpt-4o-mini + Tavily Search API
Extension:   Chrome Manifest V3 + Firefox WebExtension
Deployment:  Vercel (SSR) + Supabase Cloud
```

---

## Quick Start (Local Development)

```bash
# 1. Clone the repo
git clone https://github.com/araushan2010143/best-job-tracker-ai.git
cd best-job-tracker-ai

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Fill in your Supabase URL, Anon Key, OpenAI key

# 4. Run Supabase migrations
npx supabase db push

# 5. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Architecture

```
┌────────────────────────────────────────────────────┐
│              Next.js 15 App Router                  │
│         (Vercel Edge Network — Global CDN)          │
└───────────────────┬────────────────────────────────┘
                    │
┌───────────────────▼────────────────────────────────┐
│                  Supabase                           │
│  Auth │ Postgres + RLS │ Storage │ Realtime        │
└───────────────────┬────────────────────────────────┘
                    │
┌───────────────────▼────────────────────────────────┐
│           AI & External Services                    │
│  OpenAI gpt-4o-mini │ Tavily │ Gmail OAuth         │
└────────────────────────────────────────────────────┘
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for full details.

---

## Project Structure

```
Best-JOB-Tracker-AI/
├── app/              # Next.js 15 App Router pages + API routes
├── components/       # Kanban, AI panels, analytics charts
├── lib/              # Supabase client, OpenAI helpers
├── supabase/         # DB migrations + Edge Functions
├── extension/        # Chrome Manifest V3 extension
├── store/            # Zustand global state
└── types/            # TypeScript interfaces
```

---

## Competition Submission

This project was built using:

- **B.L.A.S.T. Framework** (Blueprint → Link → Architect → Stylize → Trigger)
- **RICE-POT Prompting** (Role → Instructions → Context → Example → Parameters → Output → Tone)

### Why This Should Win

1. **Completeness**: 8 integrated features, not a prototype
2. **Production quality**: Next.js 15 + Supabase with RLS, migrations, edge functions
3. **Real pain point**: Job tracking is universally broken. This fixes it.
4. **AI depth**: 5 distinct AI features (tailor, cover letter, cold email, parser, prep)
5. **Extensibility**: Browser extension brings the platform to where users already are

---

## Documentation

| Document | Description |
|----------|-------------|
| [PRD.md](PRD.md) | Complete Product Requirements Document |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical architecture and data flow |
| [MILESTONES.md](MILESTONES.md) | Implementation plan with GitHub issues |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Vercel + Supabase deployment guide |
| [JUDGING_RUBRIC.md](JUDGING_RUBRIC.md) | Competition scoring criteria |

---

## Contributing

This project was built for the competition. After the competition, contributions are welcome!

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

## Author

**Abhishek Raushan** | [@araushan2010143](https://github.com/araushan2010143)

Built with the B.L.A.S.T. + RICE-POT methodology from [AITESTERBLUEPRINT_3X](https://github.com/araushan2010143/AITESTERBLUEPRINT_3X).
