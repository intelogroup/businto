/**
 * Unit tests for the Phase 3 policy layer — src/lib/policy.ts (M4).
 *
 * Pure decisions (operator eligibility, specialty matching, reveal
 * gate, context visibility) plus the participation queries behind
 * validateRequestParticipation() and userMayBindLogsToRequest(),
 * against an in-memory mocked supabaseAdmin.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = {
    transport_requests: [],
    operators: [],
    quotes: [],
  };
  class QB {
    table: string;
    filters: Array<[string, any]> = [];
    constructor(t: string) {
      this.table = t;
    }
    select() {
      return this;
    }
    eq(k: string, v: any) {
      this.filters.push([k, v]);
      return this;
    }
    rows() {
      return (store[this.table] || []).filter((r) =>
        this.filters.every(([k, v]) => r[k] === v)
      );
    }
    async maybeSingle() {
      const rows = this.rows();
      return { data: rows[0] ?? null, error: null };
    }
    async single() {
      const rows = this.rows();
      return rows.length
        ? { data: rows[0], error: null }
        : { data: null, error: { message: 'not found' } };
    }
  }
  return { store, QB };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

import {
  operatorQuoteEligibility,
  fetchOperatorQuoteEligibility,
  requestMatchesOperatorSpecialties,
  validateRequestParticipation,
  userMayBindLogsToRequest,
  canRevealExactAddresses,
  gateBookingExactAddresses,
  requestContextVisibleTo,
  bookingContextVisibleTo,
} from '@/lib/policy';

const OWNER = 'rider-1';
const OPERATOR_PROFILE = 'op-profile-1';
const OPERATOR_ID = 'op-company-1';
const STRANGER = 'stranger-1';
const REQ = 'req-1';

beforeEach(() => {
  h.store.transport_requests = [{ id: REQ, user_id: OWNER }];
  h.store.operators = [
    { id: OPERATOR_ID, profile_id: OPERATOR_PROFILE, is_active: true, is_accepting_requests: true },
  ];
  h.store.quotes = [{ request_id: REQ, operator_id: OPERATOR_ID }];
});

describe('operatorQuoteEligibility', () => {
  it('active + accepting operator is eligible', () => {
    expect(operatorQuoteEligibility({ is_active: true, is_accepting_requests: true })).toEqual({
      eligible: true,
    });
  });

  it('deactivated operator is refused as inactive (pending-requests wording)', () => {
    const r = operatorQuoteEligibility({ is_active: false, is_accepting_requests: true });
    expect(r.eligible).toBe(false);
    if (!r.eligible) {
      expect(r.reason).toBe('inactive');
      expect(r.message).toBe('Operator account is inactive');
    }
  });

  it('paused operator is refused as not accepting', () => {
    const r = operatorQuoteEligibility({ is_active: true, is_accepting_requests: false });
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.reason).toBe('not_accepting_requests');
  });

  it('inactive takes precedence over paused', () => {
    const r = operatorQuoteEligibility({ is_active: false, is_accepting_requests: false });
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.reason).toBe('inactive');
  });

  it('a missing row is not a policy refusal (existence is the caller\u2019s gate)', () => {
    expect(operatorQuoteEligibility(null)).toEqual({ eligible: true });
    expect(operatorQuoteEligibility(undefined)).toEqual({ eligible: true });
  });

  it('fetchOperatorQuoteEligibility judges the stored row', async () => {
    await expect(fetchOperatorQuoteEligibility(OPERATOR_ID)).resolves.toEqual({ eligible: true });
    h.store.operators = [
      { id: OPERATOR_ID, profile_id: OPERATOR_PROFILE, is_active: false, is_accepting_requests: true },
    ];
    const r = await fetchOperatorQuoteEligibility(OPERATOR_ID);
    expect(r.eligible).toBe(false);
  });
});

describe('requestMatchesOperatorSpecialties', () => {
  it('no specialties set matches every service type', () => {
    expect(requestMatchesOperatorSpecialties(null, 'medical')).toBe(true);
    expect(requestMatchesOperatorSpecialties([], 'medical')).toBe(true);
    expect(requestMatchesOperatorSpecialties(undefined, 'school')).toBe(true);
  });

  it('specialties limit to matching service types', () => {
    expect(requestMatchesOperatorSpecialties(['school'], 'school')).toBe(true);
    expect(requestMatchesOperatorSpecialties(['school'], 'medical')).toBe(false);
    expect(requestMatchesOperatorSpecialties(['school', 'medical'], 'medical')).toBe(true);
    expect(requestMatchesOperatorSpecialties(['school'], undefined)).toBe(false);
  });
});

describe('validateRequestParticipation', () => {
  it('owner sender + owner recipient passes', async () => {
    await expect(validateRequestParticipation(OWNER, OWNER, REQ)).resolves.toBeNull();
  });

  it('owner sender + quoting-operator recipient passes', async () => {
    await expect(validateRequestParticipation(OWNER, OPERATOR_PROFILE, REQ)).resolves.toBeNull();
  });

  it('operator sender with a quote + owner recipient passes', async () => {
    await expect(validateRequestParticipation(OPERATOR_PROFILE, OWNER, REQ)).resolves.toBeNull();
  });

  it('stranger sender is refused 403 (sender leg)', async () => {
    const r = await validateRequestParticipation(STRANGER, OWNER, REQ);
    expect(r).toEqual({ status: 403, error: 'You are not a participant in this request' });
  });

  it('stranger recipient is refused 403 (recipient leg)', async () => {
    const r = await validateRequestParticipation(OWNER, STRANGER, REQ);
    expect(r).toEqual({ status: 403, error: 'Recipient is not a participant in this request' });
  });

  it('missing request is 404', async () => {
    const r = await validateRequestParticipation(OWNER, OWNER, 'req-nope');
    expect(r).toEqual({ status: 404, error: 'Request not found' });
  });
});

describe('userMayBindLogsToRequest', () => {
  it('owner may bind', async () => {
    await expect(userMayBindLogsToRequest(OWNER, REQ)).resolves.toBe(true);
  });

  it('operator with a quote may bind', async () => {
    await expect(userMayBindLogsToRequest(OPERATOR_PROFILE, REQ)).resolves.toBe(true);
  });

  it('stranger may not bind', async () => {
    await expect(userMayBindLogsToRequest(STRANGER, REQ)).resolves.toBe(false);
  });

  it('a nonexistent request binds to no one', async () => {
    await expect(userMayBindLogsToRequest(OWNER, 'req-nope')).resolves.toBe(false);
  });
});

describe('reveal gate', () => {
  it('only paid bookings may reveal exact addresses', () => {
    expect(canRevealExactAddresses({ payment_status: 'paid' })).toBe(true);
    expect(canRevealExactAddresses({ payment_status: 'unpaid' })).toBe(false);
    expect(canRevealExactAddresses({ payment_status: 'processing' })).toBe(false);
    expect(canRevealExactAddresses({ payment_status: 'refunded' })).toBe(false);
    expect(canRevealExactAddresses(null)).toBe(false);
  });

  it('paid booking passes through untouched (same object)', () => {
    const booking: any = {
      payment_status: 'paid',
      request: { pickup_address: '1 Main St', dropoff_address: '2 Oak Ave', pickup_fuzzy: 'Everett' },
    };
    expect(gateBookingExactAddresses(booking)).toBe(booking);
  });

  it('unpaid booking is a copy with exact addresses nulled, fuzzy kept, original unmutated', () => {
    const booking: any = {
      payment_status: 'unpaid',
      request: { pickup_address: '1 Main St', dropoff_address: '2 Oak Ave', pickup_fuzzy: 'Everett' },
    };
    const gated = gateBookingExactAddresses(booking) as any;
    expect(gated).not.toBe(booking);
    expect(gated.request.pickup_address).toBeNull();
    expect(gated.request.dropoff_address).toBeNull();
    expect(gated.request.pickup_fuzzy).toBe('Everett');
    expect(booking.request.pickup_address).toBe('1 Main St');
  });
});

describe('context visibility', () => {
  it('request context is visible only to its owner', () => {
    expect(requestContextVisibleTo({ user_id: OWNER }, OWNER)).toBe(true);
    expect(requestContextVisibleTo({ user_id: OWNER }, STRANGER)).toBe(false);
    expect(requestContextVisibleTo(null, OWNER)).toBe(false);
  });

  it('booking context is visible to rider and operator participants', () => {
    const booking = { user_id: OWNER, operator_id: OPERATOR_PROFILE };
    expect(bookingContextVisibleTo(booking, OWNER)).toBe(true);
    expect(bookingContextVisibleTo(booking, OPERATOR_PROFILE)).toBe(true);
    expect(bookingContextVisibleTo(booking, STRANGER)).toBe(false);
    expect(bookingContextVisibleTo(null, OWNER)).toBe(false);
  });
});
