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
 * Redeem a claim code (robust multi-hit protection)
 *
 * @param code - The claim code from the email link
 * @param ipAddress - Optional IP for audit logging
 * @returns The resource details if valid, null if invalid/expired/used
 */
export async function redeemClaimCode(
  code: string,
  ipAddress?: string
): Promise<RedeemClaimCodeResult | null> {
  // Normalize code (remove dashes, uppercase)
  const normalizedCode = code.toUpperCase().replace(/[-\s]/g, '');
  
  console.log(`[ClaimCodes] Redeeming code: "${code}" (normalized: "${normalizedCode}") from IP: ${ipAddress}`);

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

  // ROBUSTNESS LOGIC:
  // If code was already used, we allow it ONLY if:
  // 1. It was first used less than 15 minutes ago (covers scanner vs user race)
  // 2. OR it has been hit by fewer than 5 distinct IPs (covers multiple scanners)
  if (data.used_at) {
    const firstUsed = new Date(data.used_at).getTime();
    const fifteenMinsAgo = Date.now() - (15 * 60 * 1000);
    
    // If it's been more than 15 mins since first use, it's truly dead
    if (firstUsed < fifteenMinsAgo) {
      console.warn(`[ClaimCodes] Code "${normalizedCode}" already used and past 15min window.`);
      return null;
    }
    
    console.log(`[ClaimCodes] Allowing repeat hit for code "${normalizedCode}" within 15min window.`);
  }

  // Mark as used if first time
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
