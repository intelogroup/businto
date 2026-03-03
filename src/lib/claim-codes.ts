import { supabaseAdmin } from './supabase-server';
import { customAlphabet } from 'nanoid';

/**
 * Email Claim Codes: Tracking-Resistant Authentication
 *
 * Problem: Email providers (Brevo, SendGrid) wrap links with tracking proxies
 * that can break long JWT tokens in query parameters.
 *
 * Solution: Use short, simple codes in email links that exchange for full tokens
 * server-side. Even if wrapped by tracking, the short code survives.
 *
 * Flow:
 * 1. Generate short code (e.g., "CLAIM-ABC123")
 * 2. Email link: https://businto.com/claim/ABC123
 * 3. User clicks → server exchanges code for JWT → redirect with session
 */

// Use URL-safe characters, avoid ambiguous chars (0/O, 1/I/l)
const generateCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 12);

export interface CreateClaimCodeParams {
  resourceType: 'operator_quote' | 'trip_view' | 'password_reset';
  resourceId: string;
  operatorId?: string;
  userId?: string;
  purpose: 'quote' | 'view' | 'reset_password';
  expiresInMinutes?: number;
  emailSentTo?: string;
}

/**
 * Generate a short claim code for email links
 *
 * @example
 * const code = await createClaimCode({
 *   resourceType: 'operator_quote',
 *   resourceId: requestId,
 *   operatorId: operator.id,
 *   purpose: 'quote',
 *   expiresInMinutes: 10080, // 7 days
 *   emailSentTo: operator.company_email
 * });
 *
 * // Email link: https://businto.com/claim/${code}
 */
export async function createClaimCode(params: CreateClaimCodeParams): Promise<string> {
  const {
    resourceType,
    resourceId,
    operatorId,
    userId,
    purpose,
    expiresInMinutes = 10080, // 7 days default
    emailSentTo
  } = params;

  const code = generateCode();
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  const { error } = await supabaseAdmin
    .from('email_claim_codes')
    .insert({
      code,
      resource_type: resourceType,
      resource_id: resourceId,
      operator_id: operatorId,
      user_id: userId,
      purpose,
      expires_at: expiresAt.toISOString(),
      email_sent_to: emailSentTo,
    });

  if (error) {
    console.error('[ClaimCodes] Failed to create claim code:', error);
    throw new Error('Failed to generate claim code');
  }

  console.log(`[ClaimCodes] Created code ${code} for ${resourceType}:${resourceId}`);
  return code;
}

export interface RedeemClaimCodeResult {
  resourceType: string;
  resourceId: string;
  operatorId?: string;
  userId?: string;
  purpose: string;
  emailSentTo?: string;
}

/**
 * Redeem a claim code
 *
 * Claim codes are reusable until expiry. The link can be clicked many times.
 * Quote irreversibility is enforced at the /api/quotes layer (duplicate check),
 * not here.
 *
 * @param code - The claim code from the email link
 * @param ipAddress - Optional IP for audit logging
 * @returns The resource details if valid, null if invalid/expired
 */
export async function redeemClaimCode(
  code: string,
  ipAddress?: string
): Promise<RedeemClaimCodeResult | null> {
  // SELF-HEALING: If the code contains evidence of Brevo wrapping (track-click),
  // we attempt to extract the original code from the 'url' parameter.
  let targetCode = code;
  if (code.includes('track-click') || code.includes('r.af.d.sendibt')) {
    console.warn(`[ClaimCodes] DETECTED CORRUPTED BREVO LINK: "${code}"`);
    try {
      // Try to extract the code from the URL parameter if it's there
      // Brevo URLs look like: https://r.af.d.sendibt.com/tr/cl/.../url=https://businto.com/claim/ABC123
      const urlMatch = code.match(/url=([^&]+)/);
      if (urlMatch && urlMatch[1]) {
        const decodedUrl = decodeURIComponent(urlMatch[1]);
        const finalCodeMatch = decodedUrl.match(/\/claim\/([A-Z0-9]+)/i);
        if (finalCodeMatch && finalCodeMatch[1]) {
          targetCode = finalCodeMatch[1];
          console.log(`[ClaimCodes] SUCCESS: Extracted original code "${targetCode}" from Brevo tracking URL.`);
        }
      }
    } catch (e) {
      console.error('[ClaimCodes] Failed to self-heal Brevo link:', e);
    }
  }

  // Normalize code (remove dashes, uppercase)
  const normalizedCode = targetCode.toUpperCase().replace(/[-\s]/g, '');
  
  console.log(`[ClaimCodes] Redeeming code: "${targetCode}" (normalized: "${normalizedCode}") from IP: ${ipAddress}`);

  // Find non-expired code
  const { data, error } = await supabaseAdmin
    .from('email_claim_codes')
    .select('*')
    .eq('code', normalizedCode)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) {
    console.warn(`[ClaimCodes] Invalid or expired code: "${normalizedCode}". Error: ${error?.message || 'Not found'}`);
    return null;
  }

  // Mark as used if first time (audit stamp only — does not block re-use)
  if (!data.used_at) {
    const { error: updateError } = await supabaseAdmin
      .from('email_claim_codes')
      .update({
        used_at: new Date().toISOString(),
        used_from_ip: ipAddress,
      })
      .eq('id', data.id);

    if (updateError) {
      console.error('[ClaimCodes] Failed to mark code as used:', updateError);
      // Continue anyway, we have the data
    }
  }

  console.log(`[ClaimCodes] Redeemed code ${normalizedCode} for ${data.resource_type}`);

  return {
    resourceType: data.resource_type,
    resourceId: data.resource_id,
    operatorId: data.operator_id,
    userId: data.user_id,
    purpose: data.purpose,
    emailSentTo: data.email_sent_to,
  };
}

/**
 * Clean up expired claim codes (call from cron job)
 */
export async function cleanupExpiredCodes(): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const { data, error } = await supabaseAdmin
    .from('email_claim_codes')
    .delete()
    .lt('expires_at', thirtyDaysAgo.toISOString())
    .select('id');

  if (error) {
    console.error('[ClaimCodes] Failed to cleanup expired codes:', error);
    return 0;
  }

  const count = data?.length || 0;
  console.log(`[ClaimCodes] Cleaned up ${count} expired codes`);
  return count;
}
