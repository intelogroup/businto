import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Auth callback handler for:
 * - Magic link clicks
 * - Password reset email links
 * - OAuth redirects (future)
 *
 * Exchanges the one-time `code` param for a session (PKCE flow).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Redirect to the intended destination after successful auth
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error('[Auth Callback] exchangeCodeForSession error:', error.message);
  }

  // If no code or exchange failed, redirect to login with error flag
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
