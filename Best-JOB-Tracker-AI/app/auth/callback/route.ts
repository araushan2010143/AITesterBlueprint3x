import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { sendEmail, APP_URL } from '@/lib/email';
import { welcomeEmail } from '@/lib/emails/templates';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/tracker';

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Detect first sign-in: no profile row yet
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .single();

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

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
