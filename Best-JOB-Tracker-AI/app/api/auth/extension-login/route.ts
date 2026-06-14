import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Exchanges a Google ID token (from chrome.identity.launchWebAuthFlow) for
// a Supabase session.  Called only by the Chrome extension popup.
export async function POST(request: Request) {
  let idToken: string;
  let nonce: string | undefined;

  try {
    const body = await request.json();
    idToken = body.idToken;
    nonce   = body.nonce;
    if (!idToken) throw new Error('missing idToken');
  } catch {
    return NextResponse.json({ error: 'idToken required' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  // Use the anon client — signInWithIdToken creates a user session
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token:    idToken,
    nonce:    nonce,
  });

  if (error || !data.session) {
    console.error('[extension-login] signInWithIdToken error:', error?.message);
    return NextResponse.json(
      { error: error?.message || 'Failed to exchange token' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    accessToken:  data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt:    data.session.expires_at,
    email:        data.session.user.email,
  });
}
