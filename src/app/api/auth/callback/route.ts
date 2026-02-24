import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

  // Ensure next is a relative path to prevent open-redirect attacks
  if (!next.startsWith('/')) next = '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // On Vercel the actual public hostname comes from x-forwarded-host,
      // not from `origin` (which would be the internal load-balancer address).
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';

      if (isLocalEnv || !forwardedHost) {
        return NextResponse.redirect(`${origin}${next}`);
      } else {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      }
    }

    console.error('[Auth Callback] exchangeCodeForSession error:', error.message);
  }

  // If no code or exchange failed, redirect to login with error flag
  const forwardedHost = request.headers.get('x-forwarded-host');
  const base = (process.env.NODE_ENV !== 'development' && forwardedHost)
    ? `https://${forwardedHost}`
    : origin;
  return NextResponse.redirect(`${base}/login?error=auth_callback_failed`);
}
