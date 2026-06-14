import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { sendEmail, APP_URL } from '@/lib/email';
import { welcomeEmail } from '@/lib/emails/templates';

// On Vercel, request.url origin can be an internal URL.
// x-forwarded-host is the real public-facing domain — always prefer it.
function getBaseUrl(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (forwardedHost) return `${proto}://${forwardedHost}`;
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/tracker';
  const base = getBaseUrl(request);

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error:', error.message);
      return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(error.message)}`);
    }

    if (data.user) {
      // Detect first sign-in: no profile row yet
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle();

      if (!profile) {
        const displayName = (data.user.user_metadata?.full_name as string | undefined)
          ?? data.user.email?.split('@')[0]
          ?? 'there';

        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: data.user.email,
          full_name: (data.user.user_metadata?.full_name as string | undefined) ?? null,
          job_search_status: 'active',
          email_notifications: true,
          updated_at: new Date().toISOString(),
        });

        const toEmail = data.user.email;
        if (toEmail) {
          const email = welcomeEmail({ name: displayName, appUrl: APP_URL });
          void sendEmail({ to: toEmail, ...email });
        }
      }

      return NextResponse.redirect(`${base}${next}`);
    }
  }

  return NextResponse.redirect(`${base}/login?error=auth_callback_failed`);
}
