import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sendEmail, APP_URL } from '@/lib/email';
import { weeklyDigestEmail } from '@/lib/emails/templates';

export const maxDuration = 30;

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // ── Cron mode: service role bypasses RLS, queries all opted-in users ──────
  if (authHeader && cronSecret && authHeader === `Bearer ${cronSecret}`) {
    const admin = createServiceClient();

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, email, full_name')
      .eq('email_notifications', true);

    let sent = 0;
    for (const p of profiles ?? []) {
      if (!p.email) continue;
      await sendDigestForUser(admin, p.id, p.full_name ?? p.email.split('@')[0], p.email);
      sent++;
    }
    return NextResponse.json({ sent });
  }

  // ── Single-user mode: session client, respects the logged-in user ─────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, email_notifications')
    .eq('id', user.id)
    .single();

  const toEmail = profile?.email ?? user.email ?? '';
  if (!toEmail) return NextResponse.json({ error: 'No email on file' }, { status: 400 });

  await sendDigestForUser(
    supabase,
    user.id,
    profile?.full_name ?? toEmail.split('@')[0],
    toEmail,
  );
  return NextResponse.json({ sent: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendDigestForUser(supabase: any, userId: string, name: string, toEmail: string) {
  const { data: apps, error } = await supabase
    .from('applications')
    .select('status, company, ai_match_score')
    .eq('user_id', userId);

  if (error) {
    console.error('[weekly-digest] query error:', error.message);
    return;
  }

  const all = apps ?? [];
  const active     = all.filter((a: { status: string }) => !['rejected', 'ghosted', 'withdrawn'].includes(a.status));
  const interviews = all.filter((a: { status: string }) => ['phone_screen', 'technical', 'final_round'].includes(a.status));
  const offers     = all.filter((a: { status: string }) => a.status === 'offer');
  const applied    = all.filter((a: { status: string }) => !['bookmarked', 'withdrawn'].includes(a.status));

  const responseRate = applied.length
    ? Math.round((interviews.length + offers.length) / applied.length * 100)
    : 0;

  const companyCounts: Record<string, number> = {};
  active.forEach((a: { company: string }) => {
    companyCounts[a.company] = (companyCounts[a.company] ?? 0) + 1;
  });
  const topCompanies = Object.entries(companyCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([n]) => n)
    .slice(0, 5);

  const email = weeklyDigestEmail({
    toName: name,
    appUrl: APP_URL,
    stats: { total: all.length, active: active.length, interviews: interviews.length, offers: offers.length, responseRate, topCompanies },
  });

  await sendEmail({ to: toEmail, ...email });
}
