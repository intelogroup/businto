import { SignJWT, jwtVerify } from 'jose';

// Primary secret used for all new tokens
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

// Legacy secret for tokens generated before JWT_SECRET was set in env.
// Allows operators whose emails were sent before the env var was added to
// still access their quote links without needing a resend.
const JWT_SECRET_LEGACY = new TextEncoder().encode(
  'your-secret-key-change-in-production'
);

export interface OperatorViewTokenPayload {
  requestId: string;
  rid?: string; // Abbreviated version
  operatorId?: string;
  oid?: string; // Abbreviated version
  purpose: 'view' | 'quote';
  p?: 'view' | 'quote'; // Abbreviated version
  exp: number; // Unix timestamp
}

export interface UserTripTokenPayload {
  requestId: string;
  userId?: string;
  purpose: 'view_trip';
  exp: number;
}

/**
 * Helper to compress UUID into base64url (36 -> 22 chars)
 */
function toShortId(uuid?: string | null): string | undefined {
  if (!uuid) return undefined;
  // If it's not a standard UUID, return as is (e.g. for testing)
  if (uuid.length !== 36) return uuid;
  try {
    const hex = uuid.replace(/-/g, '');
    const buf = Buffer.from(hex, 'hex');
    return buf.toString('base64url');
  } catch {
    return uuid;
  }
}

/**
 * Helper to expand base64url back to UUID
 */
function fromShortId(shortId?: string | null): string | undefined {
  if (!shortId) return undefined;
  // If it's already a full UUID, return as is
  if (shortId.length === 36) return shortId;
  // Short IDs are 22 chars
  if (shortId.length !== 22) return shortId;
  try {
    const buf = Buffer.from(shortId, 'base64url');
    const hex = buf.toString('hex');
    if (hex.length !== 32) return shortId;
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20)
    ].join('-');
  } catch {
    return shortId;
  }
}

/**
 * Generate a signed token for operator view access
 * @param requestId - Transport request ID
 * @param operatorId - Optional operator ID for scoped access
 * @param purpose - Purpose of the token (view or quote)
 * @param expiryDays - Days until token expires (default: 7)
 */
export async function generateOperatorViewToken(
  requestId: string,
  operatorId?: string,
  purpose: 'view' | 'quote' = 'view',
  expiryDays: number = 7
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + (expiryDays * 24 * 60 * 60);

  // Use ultra-short keys and compressed IDs to minimize JWT length
  // This prevents URL corruption by email scanners and tracking wrappers.
  const token = await new SignJWT({
    rid: toShortId(requestId),
    oid: toShortId(operatorId),
    p: purpose,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(exp)
    .sign(JWT_SECRET);

  return token;
}

/**
 * Generate a signed token for user trip access (Magic Link style)
 * @param requestId - Transport request ID
 * @param userId - User ID
 * @param expiryDays - Days until token expires (default: 30)
 */
export async function generateUserTripToken(
  requestId: string,
  userId?: string,
  expiryDays: number = 30
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + (expiryDays * 24 * 60 * 60);

  const token = await new SignJWT({
    rid: toShortId(requestId),
    uid: toShortId(userId),
    purpose: 'view_trip',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(exp)
    .sign(JWT_SECRET);

  return token;
}

/**
 * Verify and decode an operator view token
 * @param token - JWT token string
 * @returns Decoded payload or null if invalid
 */
export async function verifyOperatorViewToken(
  token: string
): Promise<OperatorViewTokenPayload | null> {
  // Try primary secret first, then fall back to legacy secret so tokens
  // generated before JWT_SECRET was configured in the environment still work.
  const secrets = [JWT_SECRET];
  if (process.env.JWT_SECRET) {
    // Only add the legacy secret as a fallback when a custom secret IS set,
    // otherwise both entries are the same key and the second try is redundant.
    secrets.push(JWT_SECRET_LEGACY);
  }

  for (const secret of secrets) {
    try {
      const { payload } = await jwtVerify(token, secret);
      return {
        // Handle both compressed/short keys and old full keys for backward compatibility
        requestId: fromShortId((payload.rid || payload.requestId) as string)!,
        operatorId: fromShortId((payload.oid || payload.operatorId) as string | undefined),
        purpose: (payload.p || payload.purpose) as 'view' | 'quote',
        exp: payload.exp as number,
      };
    } catch (err) {
      // Try next secret
    }
  }

  console.error('Token verification failed with all known secrets');
  return null;
}

/**
 * Verify and decode a user trip access token
 * @param token - JWT token string
 * @returns Decoded payload or null if invalid
 */
export async function verifyUserTripToken(
  token: string
): Promise<UserTripTokenPayload | null> {
  const secrets = [JWT_SECRET];
  if (process.env.JWT_SECRET) {
    secrets.push(JWT_SECRET_LEGACY);
  }

  for (const secret of secrets) {
    try {
      const { payload } = await jwtVerify(token, secret);
      if (payload.purpose !== 'view_trip') continue;

      return {
        // Handle both compressed/short keys and old full keys
        requestId: fromShortId((payload.rid || payload.requestId) as string)!,
        userId: fromShortId((payload.uid || payload.userId) as string | undefined),
        purpose: 'view_trip',
        exp: payload.exp as number,
      };
    } catch (err) {
      // Try next secret
    }
  }

  return null;
}

/**
 * In-memory rate limiting store (use Redis in production)
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit for operator view access
 * @param key - Rate limit key (typically IP + requestId)
 * @param limit - Max requests per hour (default: 10)
 * @returns true if allowed, false if rate limited
 */
export function checkRateLimit(key: string, limit: number = 10): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // Clean up expired entries periodically
  if (Math.random() < 0.1) { // 10% chance
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetAt < now) {
        rateLimitStore.delete(k);
      }
    }
  }

  if (!entry || entry.resetAt < now) {
    // Create new entry with 1 hour window
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + (60 * 60 * 1000), // 1 hour
    });
    return true;
  }

  if (entry.count >= limit) {
    return false; // Rate limited
  }

  // Increment count
  entry.count++;
  return true;
}

/**
 * Get client IP address from request headers
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
