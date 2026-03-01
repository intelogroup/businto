import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
  const next = searchParams.get('next') ?? '/dashboard';

  console.log('[Auth Confirm] Received request:', {
    hasTokenHash: !!token_hash,
    type,
    next,
    origin,
  });

  if (token_hash && type) {
    const supabase = await createClient();
    console.log('[Auth Confirm] Calling verifyOtp...');
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });

    if (!error) {
      console.log('[Auth Confirm] verifyOtp success');
      
      const isLocalEnv = process.env.NODE_ENV === 'development';
      let base = origin;
      
      // PRODUCTION GUARD: Force businto.com if not in local dev
      if (!isLocalEnv && base.includes('vercel.app')) {
        base = 'https://businto.com';
      }

      const redirectTo = `${base}${next}`;
      console.log('[Auth Confirm] Redirecting to:', redirectTo);
      return NextResponse.redirect(redirectTo);
    }

    console.error('[Auth Confirm] verifyOtp error:', {
      message: error.message,
      status: (error as any).status,
      code: (error as any).code,
    });
  } else {
    console.warn('[Auth Confirm] Missing token_hash or type param');
  }

  console.warn('[Auth Confirm] Falling back to error redirect');
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
