import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Policy layer — Businto fix vision, Phase 3 (M4).
 *
 * Eligibility, participation, and reveal decisions live in ONE module
 * that routes call before writing, instead of each route re-deciding
 * them by hand (or not at all). The cards this layer retires all share
 * that shape: the decision data was already in the tree — the matching
 * engine selects only active + accepting operators, pending-requests
 * 403s inactive operators, the webhook reveals exact addresses only
 * after payment — but the write/context surfaces never consulted it.
 *
 * operatorQuoteEligibility():
 *   An operator may submit quotes only while `is_active` (not
 *   deactivated) AND `is_accepting_requests` (availability toggle on).
 *   The columns are BOOLEAN DEFAULT TRUE (migration
 *   20260110_create_operators), so a stored row always carries the
 *   business's actual setting; the policy refuses exactly the two
 *   explicit opt-out states. A missing row is NOT a refusal here —
 *   existence is established by the caller (session route resolves the
 *   operator from the row itself; the token route's M7 onboarding gate
 *   refuses a missing row) — this function judges only the status
 *   fields it is handed.
 *
 * requestMatchesOperatorSpecialties():
 *   The pending-requests filter rule. An operator with no specialties
 *   set sees every service type ("(if any)" in the route's contract);
 *   an operator with specialties sees only requests whose service_type
 *   is one of them. (The route also fetches service_areas, but requests
 *   carry no area key to match one against — they expose fuzzy
 *   locations only — so areas are not part of the matching rule.)
 *
 * validateRequestParticipation() / operatorHasQuoteOnRequest():
 *   A user participates in a transport request as its owner, or as an
 *   operator (profile → operator record) holding a quote on it. EVERY
 *   context leg a write carries must validate: a message that supplies
 *   both booking_id and request_id passes the booking leg AND this
 *   request leg (BUS-MSG-DUAL-CONTEXT-001); the single-leg request
 *   path uses the same function, so the two can never drift apart.
 *
 * userMayBindLogsToRequest():
 *   The same participation rule for ancillary writes that bind to a
 *   request (client event logs): binding requires a session and
 *   participation; unbound logs (no request_id) stay open to
 *   pre-session client logging.
 *
 * canRevealExactAddresses() / gateBookingExactAddresses():
 *   Exact pickup/dropoff addresses leave the server only for bookings
 *   whose payment_status is 'paid' — the gate the payments webhook
 *   already applies to its order-details email, and the reason the
 *   operator-view endpoint serves fuzzy locations only. Surfaces that
 *   serialize bookings pass them through the gate; a paid booking is
 *   returned untouched.
 *
 * requestContextVisibleTo() / bookingContextVisibleTo():
 *   Chat-suggestion context is loaded only for a request the caller
 *   owns or a booking the caller participates in; a foreign id is
 *   treated exactly like a nonexistent one (defaults, no error).
 */

export interface OperatorStatusFields {
  is_active?: boolean | null;
  is_accepting_requests?: boolean | null;
}

export type OperatorEligibility =
  | { eligible: true }
  | { eligible: false; reason: 'inactive' | 'not_accepting_requests'; message: string };

export function operatorQuoteEligibility(
  operator: OperatorStatusFields | null | undefined
): OperatorEligibility {
  if (operator?.is_active === false) {
    return {
      eligible: false,
      reason: 'inactive',
      message: 'Operator account is inactive',
    };
  }
  if (operator?.is_accepting_requests === false) {
    return {
      eligible: false,
      reason: 'not_accepting_requests',
      message: 'Operator is not currently accepting requests',
    };
  }
  return { eligible: true };
}

/**
 * Fetch an operator's status row and judge quote eligibility.
 * Used by the session quote route; the token route judges the row its
 * M7 onboarding fetch already loaded, via operatorQuoteEligibility().
 */
export async function fetchOperatorQuoteEligibility(
  operatorId: string
): Promise<OperatorEligibility> {
  const { data: operator } = await supabaseAdmin
    .from('operators')
    .select('is_active, is_accepting_requests')
    .eq('id', operatorId)
    .maybeSingle();
  return operatorQuoteEligibility(operator);
}

export function requestMatchesOperatorSpecialties(
  specialties: string[] | null | undefined,
  serviceType: string | null | undefined
): boolean {
  if (!specialties || specialties.length === 0) return true;
  return !!serviceType && specialties.includes(serviceType);
}

/**
 * An operator participates in a request when their operator record
 * (looked up by profile ID) holds a quote on that request.
 */
export async function operatorHasQuoteOnRequest(
  profileId: string,
  requestId: string
): Promise<boolean> {
  const { data: operator } = await supabaseAdmin
    .from('operators')
    .select('id')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (!operator) return false;

  const { data: quote } = await supabaseAdmin
    .from('quotes')
    .select('operator_id')
    .eq('request_id', requestId)
    .eq('operator_id', operator.id)
    .maybeSingle();
  return !!quote;
}

/**
 * Validate that BOTH the sender and the recipient participate in a
 * transport request (owner, or operator with a quote on it).
 * Returns null when both participate; otherwise the refusal the
 * messages route answers with — the same statuses/messages the
 * request-only path has always produced.
 */
export async function validateRequestParticipation(
  userId: string,
  recipientId: string,
  requestId: string
): Promise<{ status: number; error: string } | null> {
  const { data: req } = await supabaseAdmin
    .from('transport_requests')
    .select('user_id')
    .eq('id', requestId)
    .single();
  if (!req) {
    return { status: 404, error: 'Request not found' };
  }
  const isRequestOwner = req.user_id === userId;
  if (!isRequestOwner && !(await operatorHasQuoteOnRequest(userId, requestId))) {
    return { status: 403, error: 'You are not a participant in this request' };
  }
  if (recipientId !== req.user_id && !(await operatorHasQuoteOnRequest(recipientId, requestId))) {
    return { status: 403, error: 'Recipient is not a participant in this request' };
  }
  return null;
}

/**
 * A session user may bind ancillary writes (client logs) to a request
 * only when they participate in it — owner, or operator with a quote.
 * A nonexistent request binds to no one.
 */
export async function userMayBindLogsToRequest(
  userId: string,
  requestId: string
): Promise<boolean> {
  const { data: req } = await supabaseAdmin
    .from('transport_requests')
    .select('user_id')
    .eq('id', requestId)
    .maybeSingle();
  if (!req) return false;
  if (req.user_id === userId) return true;
  return operatorHasQuoteOnRequest(userId, requestId);
}

export function canRevealExactAddresses(
  booking: { payment_status?: string | null } | null | undefined
): boolean {
  return booking?.payment_status === 'paid';
}

/**
 * Return the booking safe to serialize: untouched when the reveal
 * gate passes (paid), otherwise a copy whose related request carries
 * no exact addresses (the fuzzy locations stay).
 */
export function gateBookingExactAddresses<
  T extends { payment_status?: string | null; request?: any }
>(booking: T): T {
  if (canRevealExactAddresses(booking) || !booking?.request) return booking;
  return {
    ...booking,
    request: { ...booking.request, pickup_address: null, dropoff_address: null },
  };
}

export function requestContextVisibleTo(
  request: { user_id?: string | null } | null | undefined,
  userId: string
): boolean {
  return !!request && request.user_id === userId;
}

export function bookingContextVisibleTo(
  booking:
    | { user_id?: string | null; operator_id?: string | null }
    | null
    | undefined,
  userId: string
): boolean {
  return (
    !!booking && (booking.user_id === userId || booking.operator_id === userId)
  );
}
