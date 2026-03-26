/**
 * In-memory rate limiting utility.
 *
 * Shared across the app for per-user, per-IP, per-recipient throttling.
 * In production with multiple serverless instances, consider Redis instead.
 */

const store = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit for any keyed action.
 * @param key - Rate limit key (e.g., "request:user-123", "email:foo@bar.com")
 * @param limit - Max requests per window (default: 10)
 * @param windowMs - Time window in milliseconds (default: 1 hour)
 * @returns true if allowed, false if rate limited
 */
export function checkRateLimit(key: string, limit: number = 10, windowMs: number = 60 * 60 * 1000): boolean {
  const now = Date.now();
  const entry = store.get(key);

  // Clean up expired entries periodically (10% chance per call)
  if (Math.random() < 0.1) {
    for (const [k, v] of store.entries()) {
      if (v.resetAt < now) {
        store.delete(k);
      }
    }
  }

  if (!entry || entry.resetAt < now) {
    store.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Get client IP address from request headers.
 * On Vercel, x-forwarded-for is set by the edge proxy.
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  if (realIP) {
    return realIP;
  }

  return 'unknown';
}
