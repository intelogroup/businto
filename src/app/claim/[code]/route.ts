import { NextRequest, NextResponse } from 'next/server';
import { redeemClaimCode } from '@/lib/claim-codes';
import { generateOperatorViewToken, generateUserTripToken } from '@/lib/tokens';
import { getAppBaseUrl } from '@/lib/email';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createClient } from '@/lib/supabase/server';

/**
 * Email Claim Code Redemption Endpoint
 *
 * Handles short claim codes from email links and exchanges them for full auth tokens.
 *
 * Flow:
 * 1. User clicks email link: https://businto.com/claim/ABC123
 * 2. This endpoint validates the code
 * 3. Generates appropriate JWT token
 * 4. NEW: Generates Supabase Auto-Login link if userId is present
 * 5. Redirects to destination with token (and optionally session)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const baseUrl = getAppBaseUrl(new URL(request.url).origin);

  // Get client IP for audit logging
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  console.log(`[Claim] Attempting to redeem code: ${code} from IP: ${ip}`);

  // Redeem the claim code
  const redemption = await redeemClaimCode(code, ip);

  if (!redemption) {
    console.warn(`[Claim] Invalid or expired code: ${code}`);
    return NextResponse.redirect(
      `${baseUrl}/?error=invalid_link&message=${encodeURIComponent(
        'This link is invalid or has expired. Please request a new one.'
      )}`
    );
  }

  // Route based on resource type
  switch (redemption.resourceType) {
    case 'operator_quote': {
      // Block if request already accepted by another operator
      const { data: requestStatus } = await supabaseAdmin
        .from('transport_requests')
        .select('status')
        .eq('id', redemption.resourceId)
        .single();

      if (requestStatus?.status === 'booked') {
        console.log(`[Claim] Request ${redemption.resourceId} already booked, blocking operator claim`);
        return NextResponse.redirect(
          `${baseUrl}/?error=request_fulfilled&message=${encodeURIComponent(
            'This request has already been fulfilled by another operator.'
          )}`
        );
      }

      // Generate data token for operator to submit quote
      const token = await generateOperatorViewToken(
        redemption.resourceId,
        redemption.operatorId,
        'quote',
        7 // 7 days
      );

      let destination = `/quotes/submit?request_id=${redemption.resourceId}&token=${token}`;

      // RETURNING USER: Check for existing active session first (no magic link needed)
      try {
        const supabase = await createClient();
        const { data: { user: existingUser } } = await supabase.auth.getUser();
        if (existingUser) {
          console.log(`[Claim] Existing session found for operator, redirecting directly`);
          return NextResponse.redirect(`${baseUrl}${destination}`);
        }
      } catch (e) {
        console.warn('[Claim] Could not check existing session:', e);
      }

      // AUTO-AUTH: If we have a userId (operator profile), generate a magic link
      if (redemption.userId) {
        try {
          // Use stored email if available, otherwise fallback to fetching from auth
          let email = redemption.emailSentTo;
          if (!email) {
            const { data: userData } = await supabaseAdmin.auth.admin.getUserById(redemption.userId);
            email = userData.user?.email;
          }

          if (email) {
            const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
              type: 'magiclink',
              email: email,
              options: { redirectTo: `${baseUrl}${destination}` }
            });

            if (!linkError && linkData?.properties?.action_link) {
              console.log(`[Claim] Generated magic link for operator`);
              return NextResponse.redirect(linkData.properties.action_link);
            }
          }
        } catch (e) {
          console.error('[Claim] Failed to generate operator magic link:', e);
        }
      }

      console.log(`[Claim] Redirecting to operator quote page (no auto-auth)`);
      return NextResponse.redirect(`${baseUrl}${destination}`);
    }

    case 'trip_view': {
      // Generate data token for user to view trip
      const token = await generateUserTripToken(
        redemption.resourceId,
        redemption.userId,
        redemption.operatorId
      );

      let destination = `/trips/${redemption.resourceId}?token=${token}`;

      // If we have an operatorId, we want to highlight that specific quote
      if (redemption.operatorId) {
        destination += `&highlight_operator=${redemption.operatorId}`;
      }

      // RETURNING USER: Check for existing active session first (no magic link needed)
      try {
        const supabase = await createClient();
        const { data: { user: existingUser } } = await supabase.auth.getUser();
        if (existingUser) {
          console.log(`[Claim] Existing session found for user, redirecting directly`);
          return NextResponse.redirect(`${baseUrl}${destination}`);
        }
      } catch (e) {
        console.warn('[Claim] Could not check existing session:', e);
      }

      // AUTO-AUTH: If we have a userId, generate a magic link for seamless login
      if (redemption.userId) {
        try {
          // Use stored email if available, otherwise fallback to fetching from auth
          let email = redemption.emailSentTo;
          if (!email) {
            const { data: userData } = await supabaseAdmin.auth.admin.getUserById(redemption.userId);
            email = userData.user?.email;
          }

          if (email) {
            const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
              type: 'magiclink',
              email: email,
              options: { redirectTo: `${baseUrl}${destination}` }
            });

            if (!linkError && linkData?.properties?.action_link) {
              console.log(`[Claim] Generated magic link for user`);
              // This link will hit /api/auth/callback (Supabase default) then redirect to our destination
              return NextResponse.redirect(linkData.properties.action_link);
            }
            if (linkError) console.warn('[Claim] Supabase link generation error:', linkError.message);
          }
        } catch (e) {
          console.error('[Claim] Failed to generate user magic link:', e);
        }
      }

      console.log(`[Claim] Redirecting to trip view (no auto-auth)`);
      return NextResponse.redirect(`${baseUrl}${destination}`);
    }

    case 'password_reset': {
      // For password reset, redirect to reset page
      // The reset page will use the Supabase session
      const destination = `${baseUrl}/login/reset-password?verified=true`;
      console.log(`[Claim] Redirecting to password reset`);
      return NextResponse.redirect(destination);
    }

    default:
      console.error(`[Claim] Unknown resource type: ${redemption.resourceType}`);
      return NextResponse.redirect(
        `${baseUrl}/?error=invalid_resource&message=${encodeURIComponent(
          'Invalid claim type. Please contact support.'
        )}`
      );
  }
}
