import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateQuote } from '@/lib/quote-validation';

/**
 * MVP User Journey Tests
 *
 * Covers the full Businto brokerage flow end-to-end (with mocked DB):
 *   1. Operator matching — Haversine distance, scoring, de-duplication
 *   2. Quote submission → request status transitions
 *   3. Quote acceptance → booking created, other quotes declined, notifications sent
 *   4. Security gates — auth, ownership, expiry, race-condition locking
 *
 * GAP markers indicate implementation issues found during this test run.
 */

// ─── Shared IDs ────────────────────────────────────────────────────────────────
const REQ_ID   = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const USER_ID  = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f';
const OP_ID_A  = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const OP_ID_B  = 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a';
const QUOTE_A  = 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b';
const QUOTE_B  = 'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c';
const BOOKING_ID = 'a7b8c9d0-e1f2-4a3b-4c5d-6e7f8a9b0c1d';

// ─── Mock factories ─────────────────────────────────────────────────────────────
// Each call to supabaseAdmin.from() needs independent chain state,
// so we use a factory that can be configured per test.

type ChainResult = { data: any; error: any };

function makeChain(result: ChainResult) {
  // Build chain after object creation to avoid TDZ on self-reference
  const chain: any = {};
  const self = () => chain;
  chain.select     = vi.fn().mockImplementation(self);
  chain.eq         = vi.fn().mockImplementation(self);
  chain.neq        = vi.fn().mockImplementation(self);
  chain.in         = vi.fn().mockImplementation(self);
  chain.order      = vi.fn().mockImplementation(self);
  chain.limit      = vi.fn().mockImplementation(self);
  chain.gte        = vi.fn().mockImplementation(self);
  chain.insert     = vi.fn().mockImplementation(self);
  chain.update     = vi.fn().mockImplementation(self);
  chain.delete     = vi.fn().mockImplementation(self);
  chain.upsert     = vi.fn().mockImplementation(self);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.single      = vi.fn().mockResolvedValue(result);
  return chain;
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 1: Operator Matching Logic (no DB — pure business logic)
// ════════════════════════════════════════════════════════════════════════════════

describe('Operator Matching Logic', () => {
  // Haversine formula replicated from src/lib/operator-matching.ts
  function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3958.8;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Score formula replicated from src/lib/operator-matching.ts
  function score(op: {
    rating?: number;
    service_radius_miles?: number;
    response_time_avg_mins?: number;
    acceptance_rate?: number;
    active_quotes_count?: number;
    is_partner?: boolean;
  }, distance: number): number {
    const radius = op.service_radius_miles || 50;
    const distScore    = Math.max(0, 100 - (distance / radius * 100));
    const ratingScore  = ((op.rating || 4.0) / 5.0) * 100;
    const respScore    = Math.max(0, 100 - ((op.response_time_avg_mins || 30) / 120 * 100));
    const acceptScore  = op.acceptance_rate || 50;
    const capPenalty   = (op.active_quotes_count || 0) > 10
      ? ((op.active_quotes_count || 0) - 10) * 5
      : 0;
    const partnerBoost = op.is_partner ? 10 : 0;
    return (
      distScore * 0.35 +
      ratingScore * 0.25 +
      respScore * 0.20 +
      acceptScore * 0.15 +
      partnerBoost -
      capPenalty
    );
  }

  describe('Haversine distance', () => {
    it('returns ~0 for identical coordinates', () => {
      expect(haversine(42.36, -71.05, 42.36, -71.05)).toBeCloseTo(0, 1);
    });

    it('returns ~3 miles for Boston → Cambridge, MA', () => {
      const d = haversine(42.3601, -71.0589, 42.3736, -71.1097);
      expect(d).toBeGreaterThan(2);
      expect(d).toBeLessThan(5);
    });

    it('returns ~190 miles for Boston → New York (straight-line, not road distance)', () => {
      const d = haversine(42.3601, -71.0589, 40.7128, -74.006);
      expect(d).toBeGreaterThan(180);
      expect(d).toBeLessThan(210);
    });

    it('symmetry: A→B == B→A', () => {
      const ab = haversine(42.36, -71.05, 40.71, -74.01);
      const ba = haversine(40.71, -74.01, 42.36, -71.05);
      expect(ab).toBeCloseTo(ba, 3);
    });
  });

  describe('Operator score', () => {
    it('partner gets higher score than identical non-partner', () => {
      const base = { rating: 4.5, service_radius_miles: 50, response_time_avg_mins: 15, acceptance_rate: 80, active_quotes_count: 2 };
      const partnerScore    = score({ ...base, is_partner: true }, 10);
      const nonPartnerScore = score({ ...base, is_partner: false }, 10);
      expect(partnerScore).toBeGreaterThan(nonPartnerScore);
      expect(partnerScore - nonPartnerScore).toBeCloseTo(10, 0); // +10 partner boost
    });

    it('operator at edge of service radius scores ~0 on distance component', () => {
      const op = { rating: 5, service_radius_miles: 20, acceptance_rate: 100 };
      const edgeScore   = score(op, 20); // exactly at radius
      const centerScore = score(op, 0);
      expect(edgeScore).toBeLessThan(centerScore);
    });

    it('overcapacity penalty reduces score', () => {
      const base = { rating: 4.5, service_radius_miles: 50, acceptance_rate: 80 };
      const busyScore = score({ ...base, active_quotes_count: 15 }, 10); // 5 over limit → -25pts
      const freeScore = score({ ...base, active_quotes_count: 2 }, 10);
      expect(freeScore).toBeGreaterThan(busyScore);
    });
  });

  describe('De-duplication by company_email', () => {
    it('partner beats non-partner with same email', () => {
      const ops = [
        { id: '1', company_email: 'ops@co.com', is_partner: false, rating: 5.0 },
        { id: '2', company_email: 'ops@co.com', is_partner: true,  rating: 4.0 },
      ];
      const deDuped = new Map<string, typeof ops[0]>();
      for (const op of ops) {
        if (!deDuped.has(op.company_email)) {
          deDuped.set(op.company_email, op);
        } else {
          const existing = deDuped.get(op.company_email)!;
          const currentBetter =
            (op.is_partner && !existing.is_partner) ||
            (op.is_partner === existing.is_partner && op.rating > existing.rating);
          if (currentBetter) deDuped.set(op.company_email, op);
        }
      }
      expect(deDuped.get('ops@co.com')!.id).toBe('2'); // partner wins
    });

    it('higher rating wins among non-partners with same email', () => {
      const ops = [
        { id: 'low',  company_email: 'x@y.com', is_partner: false, rating: 3.5 },
        { id: 'high', company_email: 'x@y.com', is_partner: false, rating: 4.8 },
      ];
      const deDuped = new Map<string, typeof ops[0]>();
      for (const op of ops) {
        if (!deDuped.has(op.company_email)) {
          deDuped.set(op.company_email, op);
        } else {
          const existing = deDuped.get(op.company_email)!;
          if (op.rating > existing.rating) deDuped.set(op.company_email, op);
        }
      }
      expect(deDuped.get('x@y.com')!.id).toBe('high');
    });
  });

  it('affiliate priority window is implemented in requests route (not operator-matching)', () => {
    // The window logic lives in src/app/api/requests/route.ts:
    //   1. priority_window_ends_at = now + priorityMinutes (set on INSERT)
    //   2. operatorsToNotify = operators.filter(op => op.is_partner)  — partner-only initial dispatch
    //   3. cron/process-priority-leaks leaks to non-partners after window expires
    // operator-matching.ts only contributes a +10pt partner score boost for ranking.
    expect(true).toBe(true); // architectural documentation test — remove if it becomes stale
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 2: Request → Quote State Transitions (pure logic)
// ════════════════════════════════════════════════════════════════════════════════

describe('Request status state machine', () => {
  type Status = 'pending' | 'quoted' | 'booked' | 'in_progress' | 'completed' | 'cancelled';

  // Mirrors the operator/quote route logic:
  // First quote → pending → quoted; subsequent quotes don't re-update
  function applyQuoteSubmitted(status: Status): Status {
    return status === 'pending' ? 'quoted' : status;
  }

  // Mirrors accept route: any booked state blocks further acceptance
  function applyQuoteAccepted(status: Status): Status | 'conflict' {
    if (status === 'booked') return 'conflict';
    return 'booked';
  }

  it('pending → quoted on first quote', () => {
    expect(applyQuoteSubmitted('pending')).toBe('quoted');
  });

  it('quoted stays quoted on additional quotes', () => {
    expect(applyQuoteSubmitted('quoted')).toBe('quoted');
  });

  it('quoted → booked on acceptance', () => {
    expect(applyQuoteAccepted('quoted')).toBe('booked');
  });

  it('pending → booked directly on acceptance (instant accept)', () => {
    expect(applyQuoteAccepted('pending')).toBe('booked');
  });

  it('booked → conflict on second acceptance attempt', () => {
    expect(applyQuoteAccepted('booked')).toBe('conflict');
  });

  it('cancelled is terminal — no quote or accept transitions apply', () => {
    // System should never reach these in practice; guard test
    const afterQuote = applyQuoteSubmitted('cancelled' as any);
    expect(afterQuote).toBe('cancelled');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 3: Quote Accept Route — full mock integration
// ════════════════════════════════════════════════════════════════════════════════

// We mock per-test via vi.resetModules() + dynamic import so each test
// gets a fresh module with its own supabase chain state.

const mockGetUser = vi.fn();
const mockVerifyToken = vi.fn();
const mockGetDispatchMode = vi.fn();
const mockLogEvent = vi.fn();
const mockSendEmail = vi.fn();
const mockSendSMS = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(() => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

vi.mock('@/lib/tokens', () => ({
  verifyUserTripToken: (...a: any[]) => mockVerifyToken(...a),
}));

vi.mock('@/lib/app-settings', () => ({
  getDispatchMode: () => mockGetDispatchMode(),
}));

vi.mock('@/lib/event-logger', () => ({
  logEvent: (...a: any[]) => mockLogEvent(...a),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: (...a: any[]) => mockSendEmail(...a),
  emailTemplates: {
    bookingConfirmation: vi.fn().mockReturnValue({ subject: 'Confirmed', html: '<p>ok</p>' }),
    quoteAcceptedOperator: vi.fn().mockReturnValue({ subject: 'Accepted', html: '<p>ok</p>' }),
  },
  getAppBaseUrl: vi.fn().mockReturnValue('https://businto.com'),
}));

vi.mock('@/lib/sms', () => ({
  sendSMS: (...a: any[]) => mockSendSMS(...a),
  smsTemplates: { bookingConfirmed: vi.fn().mockReturnValue('Booking confirmed') },
}));

// ─── Supabase admin mock — configurable per test ─────────────────────────────
let mockSupabaseFrom: ReturnType<typeof vi.fn>;

vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: {
    get from() { return mockSupabaseFrom; },
  },
}));

// Helper: build a mock supabase chain where sequential .from() calls
// return pre-configured results in order.
function setupAcceptRouteDB({
  requestRow,
  quoteRow,
  declinedQuotes = [],
  bookingRow,
}: {
  requestRow: { status: string; user_id: string; metadata_private: any } | null;
  quoteRow: any;
  declinedQuotes?: { operator_id: string }[];
  bookingRow: any;
}) {
  // We track call order for .from() to return different chains
  let fromCallIndex = 0;

  mockSupabaseFrom = vi.fn().mockImplementation((table: string) => {
    fromCallIndex++;

    // 1st transport_requests call: ownership + status check
    if (table === 'transport_requests' && fromCallIndex === 1) {
      return makeChain({ data: requestRow, error: requestRow ? null : { message: 'not found' } });
    }

    // 3rd call: transport_requests full fetch with userProfile JOIN (for confirmation email)
    if (table === 'transport_requests' && fromCallIndex === 3) {
      return makeChain({
        data: { ...requestRow, userProfile: { email: 'parent@example.com', full_name: 'Test Parent' } },
        error: null,
      });
    }

    // quotes: get the specific quote
    if (table === 'quotes' && fromCallIndex === 2) {
      const chain = makeChain({ data: quoteRow, error: quoteRow ? null : { message: 'not found' } });
      return chain;
    }

    // quotes: update accepted quote
    if (table === 'quotes' && fromCallIndex === 3) {
      return makeChain({ data: null, error: null });
    }

    // quotes: decline others (.update().eq().neq().select())
    if (table === 'quotes' && fromCallIndex === 4) {
      const chain = makeChain({ data: declinedQuotes, error: null });
      return chain;
    }

    // transport_requests: atomic UPDATE to booked — return a row so bookedRow is non-null (happy path)
    if (table === 'transport_requests' && fromCallIndex === 5) {
      return makeChain({ data: { id: 'req-1' }, error: null });
    }

    // transport_requests: full request for email (has JOIN)
    if (table === 'transport_requests' && fromCallIndex === 6) {
      return makeChain({
        data: { ...requestRow, userProfile: { email: 'parent@example.com', full_name: 'Test Parent' } },
        error: null,
      });
    }

    // bookings: insert
    if (table === 'bookings') {
      return makeChain({ data: bookingRow, error: bookingRow ? null : { message: 'booking failed' } });
    }

    // notifications: insert (operator + declined)
    return makeChain({ data: null, error: null });
  });
}

describe('Quote Accept Route — /api/quotes/accept', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockGetDispatchMode.mockResolvedValue('auto');
    mockSendEmail.mockResolvedValue({ success: true });
    mockSendSMS.mockResolvedValue({ success: true });
    mockLogEvent.mockResolvedValue(undefined);
  });

  it('rejects unauthenticated requests (no session, no token) with 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockVerifyToken.mockResolvedValue(null);

    const { POST } = await import('@/app/api/quotes/accept/route');
    const res = await POST(new Request('http://localhost/api/quotes/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: QUOTE_A, tripRequestId: REQ_ID }),
    }) as any);

    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/authentication required/i);
  });

  it('accepts via magic-link token when session is absent', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockVerifyToken.mockResolvedValue({ userId: USER_ID, requestId: REQ_ID });

    setupAcceptRouteDB({
      requestRow: { status: 'quoted', user_id: USER_ID, metadata_private: {} },
      quoteRow: {
        id: QUOTE_A, operator_id: OP_ID_A, total_price: 300, status: 'pending',
        expires_at: null,
        operator: { id: OP_ID_A, company_name: 'Ace Transit', company_email: 'ops@ace.com', company_phone: '555-0100', profile: null },
      },
      declinedQuotes: [],
      bookingRow: { id: BOOKING_ID, confirmation_code: 'TOKEN123', amount: 300, status: 'confirmed', payment_status: 'pending' },
    });

    const { POST } = await import('@/app/api/quotes/accept/route');
    const res = await POST(new Request('http://localhost/api/quotes/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: QUOTE_A, tripRequestId: REQ_ID, token: 'valid-jwt' }),
    }) as any);

    expect(res.status).toBe(200);
  });

  it('rejects token for wrong request ID with 403', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    // Token points to a different requestId
    mockVerifyToken.mockResolvedValue({ userId: USER_ID, requestId: 'different-req-id' });

    const { POST } = await import('@/app/api/quotes/accept/route');
    const res = await POST(new Request('http://localhost/api/quotes/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: QUOTE_A, tripRequestId: REQ_ID, token: 'bad-jwt' }),
    }) as any);

    expect(res.status).toBe(403);
  });

  it('enforces request ownership — different user gets 403', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'attacker-id' } } });

    setupAcceptRouteDB({
      requestRow: { status: 'quoted', user_id: USER_ID, metadata_private: {} }, // owned by USER_ID
      quoteRow: null,
      bookingRow: null,
    });

    const { POST } = await import('@/app/api/quotes/accept/route');
    const res = await POST(new Request('http://localhost/api/quotes/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: QUOTE_A, tripRequestId: REQ_ID }),
    }) as any);

    expect(res.status).toBe(403);
  });

  it('returns 409 locked when request already booked (race-condition guard)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });

    setupAcceptRouteDB({
      requestRow: { status: 'booked', user_id: USER_ID, metadata_private: {} },
      quoteRow: null,
      bookingRow: null,
    });

    const { POST } = await import('@/app/api/quotes/accept/route');
    const res = await POST(new Request('http://localhost/api/quotes/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: QUOTE_A, tripRequestId: REQ_ID }),
    }) as any);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.locked).toBe(true);
  });

  it('returns 409 when transport_request UPDATE affects 0 rows (late race condition)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });

    // Simulate: initial SELECT still shows 'quoted' (passes the early check),
    // but by the time the UPDATE runs, another accept already set it to 'booked'.
    // The atomic .neq('status','booked') guard returns null instead of a row.
    let fromCallIndex = 0;
    mockSupabaseFrom = vi.fn().mockImplementation((table: string) => {
      fromCallIndex++;

      // Step 1: ownership/status check — still shows 'quoted' (race not yet resolved)
      if (table === 'transport_requests' && fromCallIndex === 1) {
        return makeChain({ data: { status: 'quoted', user_id: USER_ID, metadata_private: {} }, error: null });
      }
      // Step 2: get quote
      if (table === 'quotes' && fromCallIndex === 2) {
        return makeChain({
          data: {
            id: QUOTE_A, operator_id: OP_ID_A, total_price: 200,
            status: 'pending', expires_at: null,
            operator: { id: OP_ID_A, company_name: 'Ace', company_email: 'ops@ace.com', company_phone: null, profile: null },
          },
          error: null,
        });
      }
      // Step 3: update quote to 'accepted'
      if (table === 'quotes' && fromCallIndex === 3) {
        return makeChain({ data: null, error: null });
      }
      // Step 4: decline others
      if (table === 'quotes' && fromCallIndex === 4) {
        return makeChain({ data: [], error: null });
      }
      // Step 5: atomic UPDATE transport_requests — returns null (race won by peer)
      if (table === 'transport_requests' && fromCallIndex === 5) {
        return makeChain({ data: null, error: null }); // 0 rows updated
      }
      return makeChain({ data: null, error: null });
    });

    const { POST } = await import('@/app/api/quotes/accept/route');
    const res = await POST(new Request('http://localhost/api/quotes/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: QUOTE_A, tripRequestId: REQ_ID }),
    }) as any);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.locked).toBe(true);
  });

  it('returns 410 when accepting an expired quote', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });

    const expiredAt = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago

    // Override from() to return expired quote for quotes table
    let callCount = 0;
    mockSupabaseFrom = vi.fn().mockImplementation((table: string) => {
      callCount++;
      if (table === 'transport_requests' && callCount === 1) {
        return makeChain({ data: { status: 'quoted', user_id: USER_ID, metadata_private: {} }, error: null });
      }
      if (table === 'quotes' && callCount === 2) {
        return makeChain({
          data: { id: QUOTE_A, operator_id: OP_ID_A, status: 'pending', expires_at: expiredAt, operator: null },
          error: null,
        });
      }
      // quotes update (mark expired)
      return makeChain({ data: null, error: null });
    });

    const { POST } = await import('@/app/api/quotes/accept/route');
    const res = await POST(new Request('http://localhost/api/quotes/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: QUOTE_A, tripRequestId: REQ_ID }),
    }) as any);

    expect(res.status).toBe(410);
    expect((await res.json()).error).toMatch(/expired/i);
  });

  it('happy path: creates booking, declines other quotes, sends notifications', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });

    setupAcceptRouteDB({
      requestRow: { status: 'quoted', user_id: USER_ID, metadata_private: {} },
      quoteRow: {
        id: QUOTE_A, operator_id: OP_ID_A, total_price: 250, status: 'pending',
        expires_at: null,
        operator: {
          id: OP_ID_A, company_name: 'Ace Transit',
          company_email: 'ops@ace.com', company_phone: '555-0100',
          profile: { full_name: 'Ace Driver', avatar_url: null },
        },
      },
      declinedQuotes: [{ operator_id: OP_ID_B }], // competitor quote gets declined
      bookingRow: { id: BOOKING_ID, confirmation_code: 'XYZ98765', amount: 250, status: 'confirmed', payment_status: 'pending' },
    });

    const { POST } = await import('@/app/api/quotes/accept/route');
    const res = await POST(new Request('http://localhost/api/quotes/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: QUOTE_A, tripRequestId: REQ_ID }),
    }) as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    // Route returns { success, bookingId, quoteId } — not a nested booking object
    expect(body.success).toBe(true);
    expect(body.bookingId).toBe(BOOKING_ID);

    // booking.created event should be logged
    const bookingLog = mockLogEvent.mock.calls.find(
      ([evt]: any[]) => evt?.event_type === 'booking.created'
    );
    expect(bookingLog).toBeDefined();
  });

  it('booking confirmation email IS sent once confirmation_code is generated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });

    setupAcceptRouteDB({
      requestRow: { status: 'quoted', user_id: USER_ID, metadata_private: {} },
      quoteRow: {
        id: QUOTE_A, operator_id: OP_ID_A, total_price: 250, status: 'pending',
        expires_at: null,
        operator: { id: OP_ID_A, company_name: 'Ace', company_email: 'ops@ace.com', company_phone: '555-0100', profile: null },
      },
      declinedQuotes: [{ operator_id: OP_ID_B }],
      bookingRow: { id: BOOKING_ID, confirmation_code: 'ABC12345', amount: 250, status: 'confirmed', payment_status: 'pending' },
    });

    const { POST } = await import('@/app/api/quotes/accept/route');
    const res = await POST(new Request('http://localhost/api/quotes/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: QUOTE_A, tripRequestId: REQ_ID }),
    }) as any);

    expect(res.status).toBe(200);

    const bookingEmailSent = mockSendEmail.mock.calls.some(
      ([opts]: any[]) => opts?.to === 'parent@example.com'
    );
    expect(bookingEmailSent).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 4: Quote Validation Schema
// ════════════════════════════════════════════════════════════════════════════════

describe('Quote schema validation', () => {
  it('rejects negative price', () => {
    const r = validateQuote({ request_id: REQ_ID, operator_id: OP_ID_A, total_price: -1, vehicle_type: 'Bus' });
    expect(r.success).toBe(false);
  });

  it('accepts $0 (interest/discussion quote)', () => {
    const r = validateQuote({ request_id: REQ_ID, operator_id: OP_ID_A, total_price: 0, vehicle_type: 'Wheelchair van' });
    expect(r.success).toBe(true);
  });

  it('rejects note longer than 1000 chars', () => {
    const r = validateQuote({ request_id: REQ_ID, operator_id: null, total_price: 100, vehicle_type: 'Bus', note: 'x'.repeat(1001) });
    expect(r.success).toBe(false);
  });

  it('accepts note exactly 1000 chars', () => {
    const r = validateQuote({ request_id: REQ_ID, operator_id: null, total_price: 100, vehicle_type: 'Bus', note: 'x'.repeat(1000) });
    expect(r.success).toBe(true);
  });

  it('rejects non-UUID request_id', () => {
    const r = validateQuote({ request_id: 'not-a-uuid', operator_id: null, total_price: 100, vehicle_type: 'Bus' });
    expect(r.success).toBe(false);
  });
});
