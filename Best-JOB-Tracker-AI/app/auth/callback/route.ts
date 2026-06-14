import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEmail, APP_URL } from '@/lib/email';
import { welcomeEmail } from '@/lib/emails/templates';

// Always redirect to the canonical production URL, never to a deployment-
// specific Vercel URL. Using NEXT_PUBLIC_APP_URL prevents the case where
// window.location.origin returns e.g. best-job-tracker-ai-abc123.vercel.app
// (a unique deployment URL) which is not registered in Google Cloud Console.
const CANONICAL_BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://best-job-tracker-ai.vercel.app';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/tracker';

  if (!code) {
    return NextResponse.redirect(`${CANONICAL_BASE}/login?error=no_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession error:', error.message);
    return NextResponse.redirect(
      `${CANONICAL_BASE}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  if (data.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!profile) {
      const displayName =
        (data.user.user_metadata?.full_name as string | undefined) ??
        data.user.email?.split('@')[0] ??
        'there';

      await supabase.from('profiles').upsert({
        id: data.user.id,
        email: data.user.email ?? '',
        full_name: (data.user.user_metadata?.full_name as string | undefined) ?? null,
        job_search_status: 'active',
        email_notifications: true,
        updated_at: new Date().toISOString(),
      });

      if (data.user.email) {
        const template = welcomeEmail({ name: displayName, appUrl: APP_URL });
        void sendEmail({ to: data.user.email, ...template });
      }
    }

    return NextResponse.redirect(`${CANONICAL_BASE}${next}`);
  }

  return NextResponse.redirect(`${CANONICAL_BASE}/login?error=auth_callback_failed`);
}
