import { SignJWT, jwtVerify } from 'jose';

// Primary secret used for all new tokens
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET env var is required — set it in your environment');
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

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
  rid?: string;
  userId?: string;
  uid?: string;
  operatorId?: string;
  oid?: string;
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
 * @param operatorId - Optional operator ID (from the quote that triggered the email)
 * @param expiryDays - Days until token expires (default: 30)
 */
export async function generateUserTripToken(
  requestId: string,
  userId?: string,
  operatorId?: string,
  expiryDays: number = 30
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + (expiryDays * 24 * 60 * 60);

  const token = await new SignJWT({
    rid: toShortId(requestId),
    uid: toShortId(userId),
    oid: toShortId(operatorId),
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
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      requestId: fromShortId(payload.rid as string)!,
      operatorId: fromShortId(payload.oid as string | undefined),
      purpose: payload.p as 'view' | 'quote',
      exp: payload.exp as number,
    };
  } catch (err) {
    console.error('Token verification failed');
    return null;
  }
}

/**
 * Verify and decode a user trip access token
 * @param token - JWT token string
 * @returns Decoded payload or null if invalid
 */
export async function verifyUserTripToken(
  token: string
): Promise<UserTripTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.purpose !== 'view_trip') return null;

    return {
      requestId: fromShortId(payload.rid as string)!,
      userId: fromShortId(payload.uid as string | undefined),
      operatorId: fromShortId(payload.oid as string | undefined),
      purpose: 'view_trip',
      exp: payload.exp as number,
    };
  } catch (err) {
    return null;
  }
}

// Re-export rate limiting utilities from dedicated module (no JWT_SECRET dependency)
export { checkRateLimit, getClientIP } from './rate-limit';
