import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Transport-request lifecycle guard — shared by the whole quotes family
 * (BUS-QUOTE-CLOSED-REQUEST-001, BUS-DASH-QUOTE-CLOSED-REQUEST-001,
 * BUS-ACCEPT-CLOSED-REQUEST-001, BUS-PASS-CLOSED-REQUEST-001).
 *
 * A transport request is OPEN only while it can still collect or hold
 * quotes: 'pending' (no quote accepted yet) or 'quoted' (quotes exist,
 * none accepted). Every quote-family action — token quote submission,
 * dashboard quote submission, quote acceptance, operator pass — must
 * refuse a request in any other status ('booked', 'cancelled',
 * 'completed', ...) instead of acting on a closed request.
 *
 * This guard decides request lifecycle only. Payment state is a separate
 * concern: it is server-decided by the verified Stripe webhook, never by
 * this module and never from client-supplied fields.
 */
export const OPEN_REQUEST_STATUSES: readonly string[] = ['pending', 'quoted'];

export function isOpenRequestStatus(status: string | null | undefined): boolean {
  return !!status && OPEN_REQUEST_STATUSES.includes(status);
}

/**
 * Fetch a transport request's current status.
 * Returns null when the request does not exist.
 */
export async function fetchRequestStatus(requestId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('transport_requests')
    .select('status')
    .eq('id', requestId)
    .maybeSingle();
  return data?.status ?? null;
}
