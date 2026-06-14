import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { sendEmail, APP_URL } from '@/lib/email';
import { welcomeEmail } from '@/lib/emails/templates';

// The canonical production URL. Never use window.location.origin or
// request.url origin here — Vercel assigns a unique URL per deployment
// (e.g. best-job-tracker-ai-abc123.vercel.app) that is NOT registered in
// Google Cloud Console. Always redirect to this fixed base.
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://best-job-tracker-ai.vercel.app';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/tracker';

  if (!code) {
    return NextResponse.redirect(`${BASE}/login?error=no_code`);
  }

  // Pre-create the success redirect so we can attach session cookies to it.
  //
  // Root cause of the 2-click bug:
  // Using createClient() from lib/supabase/server.ts (which calls `await cookies()`
  // from next/headers) sets cookies on Next.js's *internal* response object.
  // When we then return a separate NextResponse.redirect(), Next.js does NOT
  // guarantee merging those cookies into the redirect response — so the session
  // tokens never reach the browser, /tracker sees no user, and the user is
  // bounced back to /login.
  //
  // Fix: create the Supabase client inline here, reading from request.cookies
  // and writing directly onto successResponse.cookies. The same response object
  // is returned to the browser, so it carries the Set-Cookie headers.
  const successResponse = NextResponse.redirect(`${BASE}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            successResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession error:', error.message);
    return NextResponse.redirect(
      `${BASE}/login?error=${encodeURIComponent(error.message)}`
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
  }

  // Return the redirect with session cookies attached — single click login.
  return successResponse;
}
