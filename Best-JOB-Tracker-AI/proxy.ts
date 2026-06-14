import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired and forward updated tokens downstream.
  // getUser() validates the JWT server-side; getSession() only reads storage.
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPage  = pathname.startsWith('/login');
  const isAuthRoute  = pathname.startsWith('/auth');   // /auth/callback must run freely
  const isApiRoute   = pathname.startsWith('/api');

  // Guard protected routes — but NEVER intercept /auth/* (OAuth callback)
  // or /api/* (they handle their own auth).
  // BUG that was here: /auth/callback was not excluded, so the proxy
  // redirected to /login before the route handler could exchange the code.
  if (!user && !isLoginPage && !isAuthRoute && !isApiRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Bounce already-authenticated users away from the login page
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/tracker';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
