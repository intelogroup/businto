/**
 * PERMANENT REGRESSION — BUS-FORGED-PRIORITY-PAYMENT-001 (adversarial-loop probe cycle 2026-11-04-1552; fixed 2026-11-04)
 * Scenario: request creation with a FORGED payment_method_id.
 * POST /api/requests (src/app/api/requests/route.ts:208-210) derives
 *   hasPaid = !!payment_method_id
 * and stores payment_status='paid' + priority_until=now+30min for ANY
 * truthy string, with no Stripe call of any kind on that path. The
 * legitimate path to the same fields is the Stripe checkout for the
 * $1.99 "Serious Lead Priority" fee ($1.99, unit_amount 199) followed by
 * the payments webhook setting payment_status='paid' + priority_until
 * only after a verified payment (src/app/api/payments/webhook/route.ts).
 *
 * Invariant: a transport request may be recorded payment_status='paid'
 * (with a priority window) only after a verified Stripe payment; a
 * client-supplied payment_method_id alone must never set it.
 * Harness: in-memory fake supabase (repo pattern), session user mocked,
 * operator matching mocked to zero operators (fallback path returns the
 * sanitized request incl. payment_status/priority_until), Stripe mocked
 * as a recording sink, sendEmail captured.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { transport_requests: [], unified_profiles: [], notifications: [] };
  const emails: any[] = [];
  const stripeCalls: any[] = [];
  class QB {
    table: string; op = 'select'; filters: Array<[string, string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push(['eq', k, v]); return this; }
    gte(k: string, v: any) { this.filters.push(['gte', k, v]); return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    matched() {
      return store[this.table].filter((r) => this.filters.every(([op, k, v]) =>
        op === 'gte' ? String(r[k] ?? '') >= String(v) : r[k] === v));
    }
    exec() {
      if (this.op === 'insert') {
        const row = { id: `req-${store[this.table].length + 1}`, created_at: new Date().toISOString(), ...this.payload };
        store[this.table].push(row); return [row];
      }
      if (this.op === 'update') { const m = this.matched(); m.forEach((r) => Object.assign(r, this.payload)); return m; }
      return this.matched();
    }
    async single() { const r = this.exec(); return r.length ? { data: r[0], error: null } : { data: null, error: { message: 'not found' } }; }
    async maybeSingle() { const r = this.exec(); return { data: r.length ? r[0] : null, error: null }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB, emails, stripeCalls };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'rider-1', email: 'rider@synthetic.example' } }, error: null }) },
    from: (t: string) => new h.QB(t),
  })),
}));
vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: { from: (t: string) => new h.QB(t) } }));
vi.mock('@/lib/stripe', () => ({
  stripe: { checkout: { sessions: { create: vi.fn(async (a: any) => { h.stripeCalls.push(a); return { url: 'https://checkout.synthetic/x' }; }) } } },
}));
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async (m: any) => { h.emails.push(m); return { success: true, id: 'em-1' }; }),
  emailTemplates: {
    requestConfirmation: vi.fn(() => ({ subject: 'Confirm', html: '<p>c</p>' })),
    operatorNewRequest: vi.fn(() => ({ subject: 'New', html: '<p>n</p>' })),
  },
  getAppBaseUrl: vi.fn(() => 'http://localhost'),
}));
vi.mock('@/lib/sms', () => ({ sendSMS: vi.fn(async () => ({ success: true })), smsTemplates: { newRequestAlert: vi.fn(() => ({ body: 'x' })) } }));
vi.mock('@/lib/operator-matching', () => ({
  findMatchingOperators: vi.fn(async () => []),
  extractRequirements: vi.fn(() => []),
}));
vi.mock('@/lib/validation', () => ({
  splitAndValidateMetadata: vi.fn(() => ({ metadata_safe: {}, metadata_private: {} })),
  detectPrivateFieldsInSafe: vi.fn(() => []),
}));
vi.mock('@/lib/tokens', () => ({
  generateOperatorViewToken: vi.fn(async () => 'tok'),
  generateUserTripToken: vi.fn(async () => 'tok'),
}));
vi.mock('@/lib/email-helpers', () => ({
  generateOperatorQuoteLink: vi.fn(async () => 'http://localhost/claim/x'),
  generateTripViewLink: vi.fn(async () => 'http://localhost/trips/view?token=x'),
}));
vi.mock('@/lib/event-logger', () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/routing', () => ({ calculateRoute: vi.fn(async () => null), geocodeToCoords: vi.fn(async () => null) }));
vi.mock('@/lib/app-settings', () => ({ getDispatchMode: vi.fn(async () => false) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(() => true), getClientIP: vi.fn(() => '127.0.0.1') }));

import { POST } from '@/app/api/requests/route';

function seed() {
  h.store.transport_requests = [];
  h.store.unified_profiles = [{ id: 'rider-1', email: 'rider@synthetic.example', full_name: 'Rider One' }];
  h.store.notifications = [];
  h.emails.length = 0;
  h.stripeCalls.length = 0;
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

describe('forged priority payment probe', () => {
  beforeEach(seed);
  it('control: no payment_method_id -> stored payment_status pending, priority_until null', async () => {
    const res = await createReq({});
    expect(res.status).toBe(200);
    expect(h.store.transport_requests.length).toBe(1);
    expect(h.store.transport_requests[0].payment_status).toBe('pending');
    expect(h.store.transport_requests[0].priority_until).toBeNull();
  });
  it('attack: payment_method_id="pm_forged_not_real" (no Stripe payment) -> must NOT be stored paid / prioritized', async () => {
    const res = await createReq({ payment_method_id: 'pm_forged_not_real' });
    expect(res.status).toBe(200);
    expect(h.store.transport_requests.length).toBe(1);
    const row = h.store.transport_requests[0];
    expect(row.payment_status).not.toBe('paid');
    expect(row.priority_until ?? null).toBeNull();
    const body = await res.json();
    expect(body.request.payment_status).not.toBe('paid');
  });
});
