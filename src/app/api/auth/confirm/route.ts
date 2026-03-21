import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAppBaseUrl } from '@/lib/email';

/**
 * Handles token-hash based email confirmation for:
 * - Password reset  (type=recovery)
 * - Email signup    (type=signup)
 * - Magic link      (type=magiclink)
 *
 * The Supabase email template should link to:
 *   /api/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/login/reset-password
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  let next = searchParams.get('next') ?? '/dashboard';

  // Prevent open-redirect attacks: next must be a relative path
  if (!next.startsWith('/')) next = '/dashboard';

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });

    if (!error) {
      const base = getAppBaseUrl(new URL(request.url).origin);
      const redirectTo = `${base}${next}`;
      return NextResponse.redirect(redirectTo);
    }

    console.error('[Auth Confirm] verifyOtp error:', error.message);
  }

  const base = getAppBaseUrl(new URL(request.url).origin);
  return NextResponse.redirect(`${base}/login?error=auth_callback_failed`);
}
