import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PATHS = ['/dashboard', '/master/admin', '/trips', '/quotes'];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Do NOT store this client in a global — create a new one per request (Fluid compute requirement)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do not add any code between createServerClient and getUser().
  // getUser() validates the session/JWT with the server.
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;

  const { pathname, searchParams } = request.nextUrl;
  const hasToken = searchParams.has('token');
  
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  const isAdminLoginPath = pathname.startsWith('/master/admin/login');

  // EXCEPTION: Allow /quotes/submit and /trips/[id] if a token is present
  // These pages have their own internal logic to validate the token
  const isTokenizedPath = (pathname.startsWith('/quotes/submit') || pathname.startsWith('/trips/')) && hasToken;

  if (!user && isProtected && !isTokenizedPath && !isAdminLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Only set redirect if it's not the secret admin path to avoid discovery
    if (!pathname.startsWith('/master/admin')) {
      url.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(url);
  }

  // IMPORTANT: must return supabaseResponse as-is so cookies are forwarded.
  return supabaseResponse;
}
