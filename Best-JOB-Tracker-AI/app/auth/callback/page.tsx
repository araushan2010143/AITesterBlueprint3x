'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Exchange the OAuth code in the BROWSER so the PKCE code verifier is always
// accessible (it lives in the browser's cookie jar). The old server-route
// approach failed on the first attempt because the cookie key is derived from
// NEXT_PUBLIC_SUPABASE_URL — a mismatch between the value baked into the JS
// bundle and the server env caused the verifier to be stored under the wrong
// key, making exchangeCodeForSession fail until a second full round-trip
// re-seeded the cookie under the correct key.
export default function AuthCallbackPage() {
  const router = useRouter();
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const next = params.get('next') ?? '/tracker';

    if (!code) {
      router.replace('/login?error=no_code');
      return;
    }

    const supabase = createClient();
    supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
      if (error) {
        console.error('[auth/callback] exchange error:', error.message);
        router.replace(`/login?error=${encodeURIComponent(error.message)}`);
        return;
      }

      if (data.user) {
        // Fire-and-forget: create profile row + send welcome email server-side
        fetch('/api/auth/setup-profile', { method: 'POST' }).catch(() => {});
      }

      router.replace(next);
    });
  }, [router]);

  // The loading UI is rendered by loading.tsx (Suspense fallback)
  return null;
}
