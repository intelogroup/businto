import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAppBaseUrl } from '@/lib/email';

/**
 * Auth callback handler for:
 * - Magic link clicks
 * - Password reset email links  (PKCE: ?code=...&next=/login/reset-password)
 * - OAuth redirects (future)
 *
 * Exchanges the one-time `code` param for a session (PKCE flow).
 * Uses x-forwarded-host when available (required for Vercel deployments).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  let next = searchParams.get('next') ?? '/dashboard';

  console.log('[Auth Callback] Received request:', {
    hasCode: !!code,
    next,
    origin,
    forwardedHost: request.headers.get('x-forwarded-host'),
  });

  // Ensure next is a relative path to prevent open-redirect attacks
  if (!next.startsWith('/')) next = '/dashboard';

  if (code) {
    const supabase = await createClient();
    console.log('[Auth Callback] Exchanging code for session...');
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const base = getAppBaseUrl(new URL(request.url).origin);
      const redirectTo = `${base}${next}`;
      console.log('[Auth Callback] Session exchange success, redirecting to:', redirectTo);
      return NextResponse.redirect(redirectTo);
    }

    console.error('[Auth Callback] exchangeCodeForSession error:', {
      message: error.message,
      status: (error as any).status,
      code: (error as any).code,
    });
  } else {
    console.warn('[Auth Callback] No code param found in request');
  }

  // If no code or exchange failed, redirect to login with error flag
  const base = getAppBaseUrl(new URL(request.url).origin);
  console.warn('[Auth Callback] Falling back to error redirect:', `${base}/login?error=auth_callback_failed`);
  return NextResponse.redirect(`${base}/login?error=auth_callback_failed`);
}
