/**
 * Email Helper Functions - Tracking-Resistant Link Generation
 *
 * This module provides helper functions to generate tracking-resistant email links
 * using short claim codes instead of long JWT tokens.
 */

import { createClaimCode } from './claim-codes';
import { getAppBaseUrl } from './email';

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
  const code = await createClaimCode({
    resourceType: 'operator_quote',
    resourceId: requestId,
    operatorId,
    purpose: 'quote',
    expiresInMinutes: 10080, // 7 days
    emailSentTo: operatorEmail,
  });

  const baseUrl = getAppBaseUrl();
  return `${baseUrl}/claim/${code}`;
}

/**
 * Generate a tracking-resistant trip view link
 *
 * @param tripId - The trip/request ID
 * @param userId - The user ID (optional, for guests)
 * @param userEmail - The user's email
 * @returns Short claim URL
 */
export async function generateTripViewLink(
  tripId: string,
  userId: string | null,
  userEmail: string
): Promise<string> {
  const code = await createClaimCode({
    resourceType: 'trip_view',
    resourceId: tripId,
    userId: userId || undefined,
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
