import { NextRequest, NextResponse } from 'next/server';
import { redeemClaimCode } from '@/lib/claim-codes';
import { generateOperatorViewToken, generateUserTripToken } from '@/lib/tokens';
import { getAppBaseUrl } from '@/lib/email';

/**
 * Email Claim Code Redemption Endpoint
 *
 * Handles short claim codes from email links and exchanges them for full auth tokens.
 *
 * Flow:
 * 1. User clicks email link: https://businto.com/claim/ABC123
 * 2. This endpoint validates the code
 * 3. Generates appropriate JWT token
 * 4. Redirects to destination with token
 *
 * Security:
 * - One-time use codes
 * - Time-limited (default 7 days)
 * - IP logging for audit trail
 * - Graceful failure (redirect to homepage with error)
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
      // Generate JWT for operator to submit quote
      const token = await generateOperatorViewToken(
        redemption.resourceId,
        redemption.operatorId,
        'quote',
        7 // 7 days
      );

      const destination = `${baseUrl}/quotes/submit?request_id=${redemption.resourceId}&token=${token}`;
      console.log(`[Claim] Redirecting to operator quote page: ${destination}`);
      return NextResponse.redirect(destination);
    }

    case 'trip_view': {
      // Generate JWT for user to view trip
      const token = await generateUserTripToken(
        redemption.resourceId,
        redemption.userId,
        redemption.operatorId,
        30 // 30 days for trip viewing
      );

      let destination = `${baseUrl}/trips/${redemption.resourceId}?token=${token}`;
      
      // If we have an operatorId, we want to highlight that specific quote
      if (redemption.operatorId) {
        destination += `&highlight_operator=${redemption.operatorId}`;
      }
      
      console.log(`[Claim] Redirecting to trip view: ${destination}`);
      return NextResponse.redirect(destination);
    }

    case 'password_reset': {
      // For password reset, redirect to reset page
      // The reset page will use the Supabase session
      const destination = `${baseUrl}/login/reset-password?verified=true`;
      console.log(`[Claim] Redirecting to password reset: ${destination}`);
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
