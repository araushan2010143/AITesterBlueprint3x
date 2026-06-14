# DEPLOYMENT.md — Vercel + Supabase Deployment Guide

## Prerequisites

- Node.js 20+ installed
- Supabase account (free tier)
- Vercel account (free tier)
- OpenAI API key (`sk-...`)
- Tavily API key (`tvly-...`)
- Google Cloud Console project (for OAuth + Gmail)

---

## Step 1: Supabase Setup

### 1.1 Create Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Name: `best-job-tracker-ai`
4. Password: generate a strong password, save it
5. Region: pick closest to your users (ap-south-1 for India)
6. Click "Create project" — wait ~2 minutes

### 1.2 Get Connection Credentials

In Supabase Dashboard → Settings → API:
```
NEXT_PUBLIC_SUPABASE_URL = https://[your-project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY = eyJhbGc...  ← KEEP SECRET, server-only
```

### 1.3 Run Schema Migrations

Install Supabase CLI:
```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Push migrations:
```bash
supabase db push
```

Verify tables created:
```bash
supabase db diff --linked
# Should show: profiles, applications, interviews, ai_usage tables
```

### 1.4 Enable Realtime

In Supabase Dashboard → Database → Replication:
1. Click "0 tables" under "Source"
2. Toggle ON: `applications`
3. Save

### 1.5 Set Up Google OAuth (Supabase Auth)

In Supabase Dashboard → Authentication → Providers → Google:
1. Enable Google provider
2. Add your Google Client ID and Secret (from Step 3 below)
3. Copy the "Callback URL" (e.g., `https://[ref].supabase.co/auth/v1/callback`)

---

## Step 2: OpenAI + Tavily API Keys

### OpenAI
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create new key: `best-job-tracker-ai-prod`
3. Copy key: `sk-proj-...`
4. Recommended: set usage limit of $20/month in billing settings

### Tavily
1. Go to [tavily.com](https://tavily.com)
2. Sign up → Dashboard → API Keys
3. Copy key: `tvly-...`
4. Free tier: 1000 searches/month (sufficient for competition)

---

## Step 3: Google Cloud Console (OAuth + Gmail)

### 3.1 Create Project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create new project: "Best JOB Tracker AI"

### 3.2 Enable APIs
In APIs & Services → Library, enable:
- **Google Gmail API**
- **Google People API** (for profile info)

### 3.3 OAuth Credentials
In APIs & Services → Credentials → Create Credentials → OAuth Client ID:
- Application type: Web application
- Name: `best-job-tracker-ai`
- Authorized redirect URIs:
  ```
  https://[your-project-ref].supabase.co/auth/v1/callback
  http://localhost:3000/api/auth/callback/google  (for local dev)
  https://best-job-tracker-ai.vercel.app/api/auth/callback/google
  ```
- Copy: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

### 3.4 OAuth Consent Screen
In APIs & Services → OAuth consent screen:
- User type: External
- App name: "Best JOB Tracker AI"
- Scopes: add `gmail.readonly`, `userinfo.email`, `userinfo.profile`
- Test users: add your own email for testing

---

## Step 4: Resend Email (Optional)

1. Go to [resend.com](https://resend.com)
2. Create account → API Keys → Create Key
3. Copy: `RESEND_API_KEY=re_...`
4. Add your domain (or use `onboarding@resend.dev` for testing)

---

## Step 5: Local Development Setup

```bash
# Clone repo
git clone https://github.com/araushan2010143/best-job-tracker-ai.git
cd best-job-tracker-ai

# Install dependencies
npm install

# Create .env.local (NEVER commit this file)
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
OPENAI_API_KEY=sk-your-openai-key-here
TAVILY_API_KEY=tvly-your-tavily-key-here
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-google-secret
RESEND_API_KEY=re_your_resend_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF

# Start dev server
npm run dev
```

Verify: open [http://localhost:3000](http://localhost:3000) — should redirect to login page.

---

## Step 6: Vercel Deployment

### 6.1 Connect Repository

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Framework preset: Next.js (auto-detected)
4. Root directory: `./` (leave as default)
5. **DO NOT click Deploy yet** — set env vars first

### 6.2 Set Environment Variables

In Vercel project settings → Environment Variables, add all of the following:

| Variable | Value | Environment |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | All |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Production, Preview |
| `OPENAI_API_KEY` | `sk-...` | Production, Preview |
| `TAVILY_API_KEY` | `tvly-...` | Production, Preview |
| `GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` | All |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | Production, Preview |
| `RESEND_API_KEY` | `re_...` | Production, Preview |
| `NEXT_PUBLIC_APP_URL` | `https://best-job-tracker-ai.vercel.app` | Production |

### 6.3 Deploy

Click "Deploy" in Vercel. First deploy takes ~3 minutes.

After deploy, copy the production URL (e.g., `https://best-job-tracker-ai.vercel.app`).

### 6.4 Update OAuth Redirect URIs

Go back to Google Cloud Console → Credentials → your OAuth client:
- Add to Authorized redirect URIs: `https://best-job-tracker-ai.vercel.app/api/auth/callback/google`

Go to Supabase → Authentication → URL Configuration:
- Site URL: `https://best-job-tracker-ai.vercel.app`
- Redirect URLs: add `https://best-job-tracker-ai.vercel.app/**`

---

## Step 7: Browser Extension Deployment

### Load Unpacked (Development)
1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/` folder

### Update Extension API URL
In `extension/background.js`, update:
```javascript
const APP_URL = 'https://best-job-tracker-ai.vercel.app'; // change from localhost
```

### Build for Production (optional)
To submit to Chrome Web Store:
```bash
# Zip the extension folder
cd extension && zip -r ../best-job-tracker-extension.zip .
```
Upload to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

---

## Step 8: Production Verification Checklist

Run through this after deployment:

- [ ] `https://best-job-tracker-ai.vercel.app` loads without error
- [ ] Login with Google works
- [ ] Login with email/password works
- [ ] Add a job application → appears in Kanban
- [ ] Drag card between columns → status persists on refresh
- [ ] AI Resume Tailoring returns a response (not an error)
- [ ] Cover letter generation works
- [ ] Browser extension connects to production URL (not localhost)
- [ ] Analytics dashboard shows data
- [ ] Dark mode toggles correctly

---

## Troubleshooting

### "Invalid JWT" errors
→ Check `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel env vars (not `ANON_KEY`)

### Google OAuth redirect_uri_mismatch
→ Verify the exact redirect URI in Google Console matches what's in Supabase Auth settings

### Supabase RLS blocking API calls
→ Check `Authorization: Bearer {session.access_token}` is sent in all API requests

### Vercel function timeout (AI features)
→ AI routes use `export const maxDuration = 30;` — add this to any AI route handler

### Extension not capturing jobs
→ Check content script matches correct URL pattern in `manifest.json`

---

## Monitoring

- **Vercel Analytics**: Automatic (free) — page views, performance
- **Supabase Dashboard**: Query performance, auth events, storage usage
- **OpenAI Dashboard**: Token usage, API errors
- **Vercel Logs**: Real-time function logs at `vercel logs --follow`

---

## Cost Estimate (Post-Competition)

| Service | Free Tier Limits | Paid Plan |
|---------|-----------------|-----------|
| Vercel | 100GB bandwidth | $20/month Pro |
| Supabase | 500MB DB, 5GB storage | $25/month Pro |
| OpenAI | None (pay-per-use) | ~$5/month at light usage |
| Tavily | 1000 searches/month | $50/month for 10K |
| Resend | 3000 emails/month | $20/month |
| **Total** | **Free for competition** | **~$100/month at scale** |
