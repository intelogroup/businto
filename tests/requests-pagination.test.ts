/**
 * PERMANENT — BUS requests list pagination (Lane B / D6 sweep,
 * 2026-11-14). GET /api/requests returned EVERY transport request
 * of the caller (each carrying nested quotes/operators) in one
 * unbounded response: it never read page/limit. The systemic review
 * flagged it as the same unbounded shape as the carded sibling
 * lists, and the D6 decision folded it into Lane B.
 * Invariant: a list response is bounded to at most 50 entries per
 * page, whatever the underlying volume; small volumes return
 * exactly; the per-request nested shape (quotes, operators) is
 * preserved per item; the status filter names a member of the
 * request-status vocabulary or is refused 400.
 * Harness: in-memory mocked Supabase honoring eq scoping. Synthetic
 * users/requests only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { transport_requests: [] };
  const state = { user: { id: 'user-1' } as any };
  class QB {
    table: string; filters: Array<(r: any) => boolean> = [];
    constructor(t: string) { this.table = t; }
    select() { return this; }
    order() { return this; }
    eq(k: string, v: any) { this.filters.push((r) => r[k] === v); return this; }
    exec() {
      let rows = [...(store[this.table] || [])];
      for (const f of this.filters) rows = rows.filter(f);
      return rows;
    }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, state, QB };
});
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireUser: async () => h.state.user,
  requireAdmin: async () => null,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.state.user } }) },
    from: (t: string) => new h.QB(t),
  }),
}));
vi.mock('@/lib/payments', () => ({ createPriorityFeeCheckoutSession: async () => ({}) }));
vi.mock('@/lib/email', () => ({ sendEmail: async () => {}, emailTemplates: {}, getAppBaseUrl: () => 'http://localhost' }));
vi.mock('@/lib/sms', () => ({ sendSMS: async () => ({ success: true }), smsTemplates: {} }));
vi.mock('@/lib/operator-matching', () => ({ findMatchingOperators: async () => [], extractRequirements: () => [] }));
vi.mock('@/lib/validation', () => ({ splitAndValidateMetadata: () => ({ metadata_safe: {}, metadata_private: {} }), detectPrivateFieldsInSafe: () => [] }));
vi.mock('@/lib/tokens', () => ({ generateOperatorViewToken: async () => 'tok', generateUserTripToken: async () => 'tok' }));
vi.mock('@/lib/email-helpers', () => ({ generateOperatorQuoteLink: async () => 'http://localhost/x', generateTripViewLink: async () => 'http://localhost/x' }));
vi.mock('@/lib/event-logger', () => ({ logEvent: async () => {} }));
vi.mock('@/lib/routing', () => ({ calculateRoute: async () => null, geocodeToCoords: async () => null }));
vi.mock('@/lib/app-settings', () => ({ getDispatchMode: async () => 'auto' }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => true, getClientIP: () => '127.0.0.1' }));

import { GET } from '@/app/api/requests/route';

function seed(n: number, owner = 'user-1', status = 'pending') {
  h.state.user = { id: 'user-1' };
  const mk = (id: string, userId: string, st: string) => ({
    id, service_type: 'school', pickup_fuzzy: 'Everett', dropoff_fuzzy: 'Somerville',
    start_date: '2026-11-10', start_time: '08:00', end_date: null, is_recurring: false,
    recurrence_pattern: null, metadata_safe: {}, status: st, created_at: '2026-11-01T00:00:00Z',
    user_id: userId,
    quotes: [{ id: `q-${id}`, total_price: 250, status: 'pending', operator: { id: 'op-1', company_name: 'Boston Co' } }],
  });
  h.store.transport_requests = Array.from({ length: n }, (_, i) => mk(`req-${i + 1}`, owner, status));
}
const req = (qs = '') => new NextRequest(`http://localhost/api/requests${qs}`);

describe('requests list must be bounded like sibling lists, nested shape preserved', () => {
  beforeEach(() => seed(0));
  it('control: unauthenticated callers still see exactly the empty list shape', async () => {
    seed(5); h.state.user = null;
    const r = await GET(req()); expect(r.status).toBe(200); const b = await r.json();
    expect(b).toEqual({ requests: [] });
  });
  it('control: small volume (2 requests) returns exactly 2 with nested quotes intact', async () => {
    seed(2); const r = await GET(req()); expect(r.status).toBe(200); const b = await r.json();
    expect(b.requests).toHaveLength(2);
    expect(b.requests[0].quotes).toHaveLength(1);
    expect(b.requests[0].quotes[0].operator.company_name).toBe('Boston Co');
    expect(b.total).toBe(2);
  });
  it('attack: 60 requests return the first 20 by default, total still 60', async () => {
    seed(60); const r = await GET(req()); expect(r.status).toBe(200); const b = await r.json();
    expect(b.requests).toHaveLength(20);
    expect(b.total).toBe(60); expect(b.page).toBe(1); expect(b.limit).toBe(20); expect(b.totalPages).toBe(3);
  });
  it('attack: explicit ?limit=5&page=2 is honored', async () => {
    seed(60); const r = await GET(req('?limit=5&page=2')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.requests).toHaveLength(5); expect(b.requests[0].id).toBe('req-6'); expect(b.total).toBe(60);
  });
  it('attack: limit above the ceiling clamps to 50', async () => {
    seed(60); const r = await GET(req('?limit=500')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.requests).toHaveLength(50); expect(b.limit).toBe(50);
  });
  it("control: another user's requests are never included", async () => {
    seed(60);
    h.store.transport_requests.push(
      { id: 'foreign-1', user_id: 'user-2', status: 'pending', quotes: [] },
      { id: 'foreign-2', user_id: 'user-2', status: 'pending', quotes: [] }
    );
    const r = await GET(req('?limit=50')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.total).toBe(60);
    expect(b.requests.every((x: any) => x.user_id === 'user-1')).toBe(true);
  });
  it('control: a valid status filter narrows exactly', async () => {
    seed(30, 'user-1', 'pending');
    h.store.transport_requests.push(
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `booked-${i + 1}`, user_id: 'user-1', status: 'booked', quotes: [],
      }))
    );
    const r = await GET(req('?status=pending&limit=50')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.total).toBe(30);
    expect(b.requests.every((x: any) => x.status === 'pending')).toBe(true);
  });
  it('attack: malformed page/limit are refused 400', async () => {
    seed(5);
    expect((await GET(req('?page=abc'))).status).toBe(400);
    expect((await GET(req('?limit=-1'))).status).toBe(400);
    expect((await GET(req('?limit=0'))).status).toBe(400);
  });
  it('attack: a status outside the vocabulary is refused 400, never a silent empty 200', async () => {
    seed(5);
    expect((await GET(req('?status=bogus'))).status).toBe(400);
  });
});
