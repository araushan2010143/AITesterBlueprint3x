import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Required by @supabase/ssr: runs on every request to refresh access tokens
// and forward the updated session cookies to both the outgoing response and
// the downstream server components. Without this, server components can see
// a stale or missing session even when the browser holds a valid JWT.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // Forward any updated tokens to both the request (so server components
          // read the refreshed value) and the response (so the browser saves them).
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired (getUser validates the JWT against Supabase).
  // Do NOT call getSession() here — it reads only from storage, not the server.
  const { data: { user } } = await supabase.auth.getUser();

  // Redirect unauthenticated requests for protected routes to /login.
  const { pathname } = request.nextUrl;
  const isProtected =
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/auth') &&
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/_next') &&
    pathname !== '/favicon.ico' &&
    pathname !== '/robots.txt';

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Match all paths except static assets
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
