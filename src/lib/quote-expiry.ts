/**
 * Quote Expiry Validation
 *
 * Server-side utilities to enforce quote expiry.
 * Import this in any API route that needs to check whether a quote is still valid
 * before allowing acceptance or modification.
 *
 * Design: Quotes with `expires_at` set to a past timestamp must be rejected.
 * Quotes without `expires_at` never expire (backwards-compatible).
 */

export interface QuoteExpiryCheck {
  /** Whether the quote has expired */
  isExpired: boolean;
  /** HTTP status code to return if expired (410 Gone) */
  statusCode: 410 | 200;
  /** Error message if expired */
  error?: string;
  /** Remaining seconds until expiry (negative if expired) */
  remainingSeconds: number;
}

/**
 * Check whether a quote has expired based on its `expires_at` timestamp.
 *
 * @param expiresAt — ISO string or Date from the database `quotes.expires_at` column
 * @returns QuoteExpiryCheck with isExpired flag and metadata
 *
 * Usage in API routes:
 * ```ts
 * import { checkQuoteExpiry } from '@/lib/quote-expiry';
 *
 * const expiry = checkQuoteExpiry(quote.expires_at);
 * if (expiry.isExpired) {
 *   return NextResponse.json({ error: expiry.error }, { status: expiry.statusCode });
 * }
 * ```
 */
export function checkQuoteExpiry(expiresAt: string | Date | null | undefined): QuoteExpiryCheck {
  // No expiry set — quote never expires (backwards-compatible)
  if (!expiresAt) {
    return {
      isExpired: false,
      statusCode: 200,
      remainingSeconds: Infinity,
    };
  }

  const target = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;

  // Guard against invalid date
  if (isNaN(target.getTime())) {
    return {
      isExpired: false,
      statusCode: 200,
      remainingSeconds: Infinity,
    };
  }

  const now = new Date();
  const remainingMs = target.getTime() - now.getTime();
  const remainingSeconds = Math.floor(remainingMs / 1000);

  if (remainingSeconds <= 0) {
    return {
      isExpired: true,
      statusCode: 410,
      error: 'This quote has expired and can no longer be accepted. Please request new quotes.',
      remainingSeconds,
    };
  }

  return {
    isExpired: false,
    statusCode: 200,
    remainingSeconds,
  };
}

/**
 * Check if a quote status indicates it's no longer actionable.
 * Combines status check with expiry timestamp check.
 */
export function isQuoteActionable(
  status: string,
  expiresAt: string | Date | null | undefined
): { actionable: boolean; reason?: string } {
  // Status-based checks
  if (status === 'accepted') {
    return { actionable: false, reason: 'Quote has already been accepted' };
  }
  if (status === 'declined') {
    return { actionable: false, reason: 'Quote has been declined' };
  }
  if (status === 'expired') {
    return { actionable: false, reason: 'Quote has expired' };
  }

  // Time-based expiry check
  const expiry = checkQuoteExpiry(expiresAt);
  if (expiry.isExpired) {
    return { actionable: false, reason: expiry.error };
  }

  return { actionable: true };
}

/**
 * Default quote expiry duration in hours.
 * Used when creating new quotes if no custom duration is specified.
 */
export const DEFAULT_QUOTE_EXPIRY_HOURS = 24;

/**
 * Calculate the expiry timestamp for a new quote.
 *
 * @param hoursFromNow — hours until the quote expires (default: 24)
 * @returns ISO string for the expiry timestamp
 */
export function calculateQuoteExpiry(hoursFromNow: number = DEFAULT_QUOTE_EXPIRY_HOURS): string {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + hoursFromNow);
  return expiry.toISOString();
}
