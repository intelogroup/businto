/**
 * Email Helper Functions - Tracking-Resistant Link Generation
 *
 * This module provides helper functions to generate tracking-resistant email links
 * using short claim codes instead of long JWT tokens.
 */

import { createClaimCode } from './claim-codes';
import { getAppBaseUrl } from './email';
import { logClaimLinkGeneration } from './email-logger';
import { supabaseAdmin } from './supabase-server';

/**
 * Validates that a claim link is properly formed and doesn't contain corruption
 */
function validateClaimLink(link: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check basic format
  if (!link.startsWith('http')) {
    issues.push('Claim link does not start with http');
  }

  // Check for claim path
  if (!link.includes('/claim/')) {
    issues.push('Claim link does not contain /claim/ path');
  }

  // Check for suspicious patterns that indicate Brevo wrapping
  if (link.includes('.r.af.d.sendibt') || link.includes('/tr/cl/')) {
    issues.push('Claim link appears to be wrapped by Brevo tracking URL');
  }

  // Check length is reasonable (shorter than typical Brevo tracking URLs)
  if (link.length > 500) {
    issues.push(`Claim link is unusually long (${link.length} chars) - may indicate corruption`);
  }

  // Validate code structure (should be alphanumeric after /claim/)
  const codeMatch = link.match(/\/claim\/([a-zA-Z0-9-]+)$/);
  if (!codeMatch) {
    issues.push('Claim code format is invalid');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Generate a tracking-resistant operator quote link
 *
 * OLD (vulnerable to tracking):
 *   https://businto.com/quotes/submit?request_id=xxx&token=LONG_JWT...
 *
 * NEW (tracking-resistant):
 *   https://businto.com/claim/ABC123
 *
 * @param requestId - The transport request ID
 * @param operatorId - The operator ID
 * @param operatorEmail - The operator's email (for audit trail)
 * @returns Short claim URL
 */
export async function generateOperatorQuoteLink(
  requestId: string,
  operatorId: string,
  operatorEmail: string
): Promise<string> {
  // Fetch operator's profile_id to enable magic link auto-auth
  let userId: string | undefined;
  try {
    const { data } = await supabaseAdmin
      .from('operators')
      .select('profile_id')
      .eq('id', operatorId)
      .single();
    if (data?.profile_id) userId = data.profile_id;
  } catch (e) {
    console.warn(`[EmailHelpers] Could not fetch profile_id for operator ${operatorId}`);
  }

  const code = await createClaimCode({
    resourceType: 'operator_quote',
    resourceId: requestId,
    operatorId,
    userId,
    purpose: 'quote',
    expiresInMinutes: 10080, // 7 days
    emailSentTo: operatorEmail,
  });

  const baseUrl = getAppBaseUrl();
  const link = `${baseUrl}/claim/${code}`;
  
  // Validate before returning
  const validation = validateClaimLink(link);
  if (!validation.valid) {
    console.error(`🔴 Generated claim link failed validation:`, validation.issues);
  }

  await logClaimLinkGeneration(requestId, operatorEmail, link, operatorId);
  return link;
}

/**
 * Generate a tracking-resistant trip view link
 *
 * @param tripId - The trip/request ID
 * @param userId - The user ID (optional, for guests)
 * @param userEmail - The user's email
 * @param operatorId - Optional operator ID to highlight
 * @returns Short claim URL
 */
export async function generateTripViewLink(
  tripId: string,
  userId: string | null,
  userEmail: string,
  operatorId?: string
): Promise<string> {
  const code = await createClaimCode({
    resourceType: 'trip_view',
    resourceId: tripId,
    userId: userId || undefined,
    operatorId,
    purpose: 'view',
    expiresInMinutes: 43200, // 30 days
    emailSentTo: userEmail,
  });

  const baseUrl = getAppBaseUrl();
  return `${baseUrl}/claim/${code}`;
}

/**
 * Example: How to update operator email sending
 *
 * BEFORE:
 * ```typescript
 * const accessToken = await generateOperatorViewToken(requestId, operatorId, 'quote', 7);
 * const link = `${appBaseUrl}/quotes/submit?request_id=${requestId}&token=${accessToken}`;
 * ```
 *
 * AFTER:
 * ```typescript
 * const link = await generateOperatorQuoteLink(requestId, operatorId, operator.company_email);
 * ```
 *
 * The link is now tracking-resistant and much shorter!
 */
