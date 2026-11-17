/**
 * PERMANENT REGRESSION — BUS-REQUEST-CREATE-SHAPE-001 (converted from the loop probe of cycle 2026-11-17-0652; assertions unchanged)
 * POST /api/requests hostile required-field shapes. The route checks only
 * truthiness for pickup_address / dropoff_address / start_date, validates
 * service_type against a vocabulary, then calls pickup_address.split(',')
 * while building the insert and stores start_date verbatim.
 * Invariant: required fields are strings of the expected shape, or the
 * request is refused 400 — never a 500, never an insert carrying a
 * hostile-typed field; a valid control creates exactly one request with
 * server-decided payment_status 'pending'.
 * Harness: in-memory mocked Supabase (repo forged-priority-payment pattern),
 * synthetic rider only, all transports mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { transport_requests: [], unified_profiles: [], notifications: [] };
  class QB {
    table: string; op = 'select'; filters: Array<[string, string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push(['eq', k, v]); return this; }
    gte(k: string, v: any) { this.filters.push(['gte', k, v]); return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    matched() { return store[this.table].filter((r) => this.filters.every(([op, k, v]) => op === 'gte' ? String(r[k] ?? '') >= String(v) : r[k] === v)); }
    exec() {
      if (this.op === 'insert') { const row = { id: `req-${store[this.table].length + 1}`, created_at: new Date().toISOString(), ...this.payload }; store[this.table].push(row); return [row]; }
      if (this.op === 'update') { const m = this.matched(); m.forEach((r) => Object.assign(r, this.payload)); return m; }
      return this.matched();
    }
    async single() { const r = this.exec(); return r.length ? { data: r[0], error: null } : { data: null, error: { message: 'not found' } }; }
    async maybeSingle() { const r = this.exec(); return { data: r.length ? r[0] : null, error: null }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB };
});
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'rider-1', email: 'rider@synthetic.example' } }, error: null }) },
    from: (t: string) => new h.QB(t),
  })),
}));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (t: string) => new h.QB(t) } }));
vi.mock('@/lib/payments', () => ({ createPriorityFeeCheckoutSession: vi.fn(async () => ({ url: 'https://checkout.synthetic/x' })) }));
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async () => ({ success: true, id: 'em-1' })),
  emailTemplates: { requestConfirmation: vi.fn(() => ({ subject: 'Confirm', html: '<p>c</p>' })), operatorNewRequest: vi.fn(() => ({ subject: 'New', html: '<p>n</p>' })) },
  getAppBaseUrl: vi.fn(() => 'http://localhost'),
}));
vi.mock('@/lib/sms', () => ({ sendSMS: vi.fn(async () => ({ success: true })), smsTemplates: { newRequestAlert: vi.fn(() => ({ body: 'x' })) } }));
vi.mock('@/lib/operator-matching', () => ({ findMatchingOperators: vi.fn(async () => []), extractRequirements: vi.fn(() => []) }));
vi.mock('@/lib/validation', () => ({ splitAndValidateMetadata: vi.fn(() => ({ metadata_safe: {}, metadata_private: {} })), detectPrivateFieldsInSafe: vi.fn(() => []) }));
vi.mock('@/lib/tokens', () => ({ generateOperatorViewToken: vi.fn(async () => 'tok'), generateUserTripToken: vi.fn(async () => 'tok') }));
vi.mock('@/lib/email-helpers', () => ({ generateOperatorQuoteLink: vi.fn(async () => 'http://localhost/claim/x'), generateTripViewLink: vi.fn(async () => 'http://localhost/trips/view?token=<redacted>') }));
vi.mock('@/lib/event-logger', () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/routing', () => ({ calculateRoute: vi.fn(async () => null), geocodeToCoords: vi.fn(async () => null) }));
vi.mock('@/lib/app-settings', () => ({ getDispatchMode: vi.fn(async () => false) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(() => true), getClientIP: vi.fn(() => '127.0.0.1') }));
import { POST } from '@/app/api/requests/route';
function seed() {
  h.store.transport_requests = [];
  h.store.unified_profiles = [{ id: 'rider-1', email: 'rider@synthetic.example', full_name: 'Rider One' }];
  h.store.notifications = [];
}
function createReq(extra: Record<string, any>) {
  const req = new NextRequest('http://localhost/api/requests', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      service_type: 'school',
      pickup_address: '1 Main St, Everett, MA',
      dropoff_address: '2 Oak Ave, Somerville, MA',
      pickup_lat: 42.4, pickup_lng: -71.05, dropoff_lat: 42.38, dropoff_lng: -71.1,
      start_date: '2026-11-20',
      ...extra,
    }),
  });
  return POST(req);
}
describe('request creation hostile required-field shapes', () => {
  beforeEach(() => seed());
  it('control: valid request creates exactly one pending request', async () => {
    const r = await createReq({});
    expect(r.status).toBe(200);
    expect(h.store.transport_requests).toHaveLength(1);
    expect(h.store.transport_requests[0].payment_status).toBe('pending');
  });
  it('attack: non-string pickup_address refused 400, never 500, no insert', async () => {
    for (const v of [12345, true, ['1 Main St'], { street: '1 Main St' }, 1.5]) {
      seed();
      const r = await createReq({ pickup_address: v });
      expect(r.status, JSON.stringify(v)).toBe(400);
      expect(h.store.transport_requests).toHaveLength(0);
    }
  });
  it('attack: non-string dropoff_address refused 400, never 500, no insert', async () => {
    for (const v of [12345, true, ['2 Oak Ave'], { street: '2 Oak Ave' }, 1.5]) {
      seed();
      const r = await createReq({ dropoff_address: v });
      expect(r.status, JSON.stringify(v)).toBe(400);
      expect(h.store.transport_requests).toHaveLength(0);
    }
  });
  it('attack: non-string start_date refused 400, never stored verbatim', async () => {
    for (const v of [12345, true, ['2026-11-20'], { d: '2026-11-20' }, 1.5]) {
      seed();
      const r = await createReq({ start_date: v });
      expect(r.status, JSON.stringify(v)).toBe(400);
      expect(h.store.transport_requests).toHaveLength(0);
    }
  });
});
