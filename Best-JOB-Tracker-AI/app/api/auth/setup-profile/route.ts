import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEmail, APP_URL } from '@/lib/email';
import { welcomeEmail } from '@/lib/emails/templates';

// Called from the client-side auth/callback page immediately after a successful
// exchangeCodeForSession so new users get a profile row and welcome email.
// Fire-and-forget — failures here must never block the login redirect.
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!existing) {
      const displayName =
        (user.user_metadata?.full_name as string | undefined) ??
        user.email?.split('@')[0] ??
        'there';

      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email ?? '',
        full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
        job_search_status: 'active',
        email_notifications: true,
        updated_at: new Date().toISOString(),
      });

      if (user.email) {
        const template = welcomeEmail({ name: displayName, appUrl: APP_URL });
        void sendEmail({ to: user.email, ...template });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[setup-profile] error:', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
