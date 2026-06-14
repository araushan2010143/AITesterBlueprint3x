/**
 * Dry-run email test — sends all 3 email types with REAL data from Supabase.
 * Run: node scripts/test-email.mjs <your@email.com>
 *
 * On Resend free tier, emails can only be delivered to your VERIFIED email.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ───────────────────────────────────────────────────────────
const envPath = resolve(__dir, '../.env.local');
const envLines = readFileSync(envPath, 'utf8').split('\n');
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

const RESEND_API_KEY      = process.env.RESEND_API_KEY;
const SUPABASE_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FROM                = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const APP_URL             = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const TO                  = process.argv[2];

if (!TO) { console.error('Usage: node scripts/test-email.mjs <your@email.com>'); process.exit(1); }
if (!RESEND_API_KEY || RESEND_API_KEY.startsWith('re_your')) { console.error('❌  RESEND_API_KEY not set'); process.exit(1); }
if (!SERVICE_ROLE_KEY) { console.error('❌  SUPABASE_SERVICE_ROLE_KEY not set'); process.exit(1); }

const { Resend }        = await import('resend');
const { createClient }  = await import('@supabase/supabase-js');

const resend  = new Resend(RESEND_API_KEY);
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── Lookup user by email ──────────────────────────────────────────────────────
console.log(`\n🧪  JOB Tracker AI — Email Dry Run (real data)`);
console.log(`   FROM : ${FROM}`);
console.log(`   TO   : ${TO}`);
console.log(`   KEY  : ${RESEND_API_KEY.slice(0, 12)}…\n`);

// Find the user in auth.users
const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
if (usersError) { console.error('❌  Could not list users:', usersError.message); process.exit(1); }

const authUser = usersData.users.find(u => u.email === TO);
if (!authUser) {
  console.error(`❌  No user found with email "${TO}". Make sure you've signed up with this address.`);
  process.exit(1);
}

console.log(`   User : ${authUser.id} (${authUser.email})`);

// Fetch their profile
const { data: profile } = await supabase
  .from('profiles')
  .select('full_name, email')
  .eq('id', authUser.id)
  .single();

const displayName = profile?.full_name ?? TO.split('@')[0];

// Fetch their real applications
const { data: apps, error: appsError } = await supabase
  .from('applications')
  .select('status, company, ai_match_score')
  .eq('user_id', authUser.id);

if (appsError) { console.error('❌  Could not fetch applications:', appsError.message); process.exit(1); }

const all        = apps ?? [];
const active     = all.filter(a => !['rejected', 'ghosted', 'withdrawn'].includes(a.status));
const interviews = all.filter(a => ['phone_screen', 'technical', 'final_round'].includes(a.status));
const offers     = all.filter(a => a.status === 'offer');
const applied    = all.filter(a => !['bookmarked', 'withdrawn'].includes(a.status));
const responseRate = applied.length
  ? Math.round((interviews.length + offers.length) / applied.length * 100)
  : 0;

const companyCounts = {};
active.forEach(a => { companyCounts[a.company] = (companyCounts[a.company] ?? 0) + 1; });
const topCompanies = Object.entries(companyCounts).sort((a,b)=>b[1]-a[1]).map(([n])=>n).slice(0,5);

console.log(`   Real stats → total:${all.length}  active:${active.length}  interviews:${interviews.length}  offers:${offers.length}  response:${responseRate}%`);
if (topCompanies.length) console.log(`   Top companies → ${topCompanies.join(', ')}`);
console.log('');

// ── Send helper ───────────────────────────────────────────────────────────────
async function send(label, subject, html) {
  process.stdout.write(`  Sending ${label}... `);
  try {
    const res = await resend.emails.send({ from: FROM, to: TO, subject, html });
    if (res.error) throw new Error(res.error.message);
    console.log(`✅  id=${res.data?.id}`);
  } catch (err) {
    console.log(`❌  ${err.message}`);
  }
}

// ── Templates (minimal inline versions) ──────────────────────────────────────
const BRAND = '#4F46E5';
function card(body) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;font-family:sans-serif;padding:40px 16px;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="text-align:center;margin-bottom:20px;">
      <div style="display:inline-flex;align-items:center;gap:10px;">
        <div style="background:${BRAND};border-radius:10px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:13px;">JT</div>
        <strong style="font-size:16px;color:#1e293b;">JOB Tracker AI</strong>
      </div>
    </div>
    <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:36px;">
      ${body}
    </div>
  </div>
</body></html>`;
}

// 1. Welcome
await send(
  '1/3 Welcome email',
  "Welcome to JOB Tracker AI — let's land your next role",
  card(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0f172a;">Welcome, ${displayName}! 👋</h1>
    <p style="color:#475569;font-size:15px;">Your AI-powered career OS is ready. Add your first job, tailor your resume, and track every application.</p>
    <div style="text-align:center;margin-top:24px;">
      <a href="${APP_URL}/tracker" style="background:${BRAND};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;display:inline-block;">Open dashboard →</a>
    </div>
  `)
);

// 2. Milestone — Offer
const firstActive = active[0];
const company  = firstActive?.company ?? 'Acme Corp';

await send(
  '2/3 Milestone email (offer)',
  `🎉 You got an OFFER! — ${company}`,
  card(`
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:48px;">🎉</div>
      <h1 style="margin:12px 0 6px;font-size:22px;font-weight:800;color:#0f172a;">You got an OFFER!</h1>
      <p style="margin:0;font-size:14px;color:#64748b;font-weight:600;">at ${company}</p>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px;margin-bottom:20px;">
      <p style="margin:0;font-size:14px;color:#166534;line-height:1.7;">Congratulations ${displayName}, your hard work paid off. Review the offer carefully and celebrate this win!</p>
    </div>
    <div style="text-align:center;">
      <a href="${APP_URL}/tracker" style="background:#10B981;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;display:inline-block;">View application →</a>
    </div>
  `)
);

// 3. Weekly digest — real data
await send(
  '3/3 Weekly digest (real data)',
  `Your weekly job search report — ${all.length} application${all.length !== 1 ? 's' : ''} tracked`,
  card(`
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#0f172a;">Weekly Report 📊</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;">Hi ${displayName}, here's your real job search snapshot.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        ${[
          {v: all.length,        label:'Total',      color: BRAND},
          {v: active.length,     label:'Active',     color:'#3B82F6'},
          {v: interviews.length, label:'Interviews', color:'#8B5CF6'},
          {v: offers.length,     label:'Offers',     color:'#10B981'},
        ].map(s=>`
          <td width="25%" style="padding:0 4px;">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 8px;text-align:center;">
              <p style="margin:0;font-size:24px;font-weight:800;color:${s.color};">${s.v}</p>
              <p style="margin:4px 0 0;font-size:10px;color:#94a3b8;text-transform:uppercase;">${s.label}</p>
            </div>
          </td>`).join('')}
      </tr>
    </table>
    ${topCompanies.length ? `<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#0f172a;">Active companies:</p><p style="margin:0 0 20px;font-size:13px;color:#475569;">${topCompanies.join(' · ')}</p>` : ''}
    <p style="margin:0;font-size:13px;color:#475569;">Response rate: <strong>${responseRate}%</strong></p>
    <div style="text-align:center;margin-top:24px;">
      <a href="${APP_URL}/analytics" style="background:${BRAND};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;display:inline-block;">View analytics →</a>
    </div>
  `)
);

console.log(`\n✅  Done. Check inbox at: ${TO}`);
console.log(`   Stats sent: total=${all.length} active=${active.length} interviews=${interviews.length} offers=${offers.length}\n`);
