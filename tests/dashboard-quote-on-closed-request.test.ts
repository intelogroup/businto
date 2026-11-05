/**
 * PERMANENT REGRESSION — BUS-DASH-QUOTE-CLOSED-REQUEST-001 (adversarial-loop probe cycle 2026-11-04-1252; fixed 2026-11-04)
 * Scenario: dashboard (session-authenticated) operator quote on a CLOSED
 * transport request. POST /api/operator/quote is the second quote-submission
 * entry point (dashboard UI, session auth) beside the token route in
 * BUS-QUOTE-CLOSED-REQUEST-001. It checks the accepted-quote lock and
 * duplicates, but NEVER reads transport_requests.status before inserting —
 * it does not fetch the request at all until after the insert (for the
 * rider notification email).
 *
 * Invariant: a quote may be submitted only on an open request
 * (pending/quoted); a cancelled or completed request accepts no new quote
 * and triggers no rider email/notification.
 * Harness: in-memory fake supabaseAdmin (repo pattern), requireUser mocked
 * to a synthetic operator, sendEmail captured as a sink.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { transport_requests: [], quotes: [], notifications: [], operator_profiles: [], operators: [] };
  const emails: any[] = [];
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    delete() { this.op = 'delete'; return this; }
    matched() { return store[this.table].filter((r) => this.filters.every(([k, v]) => r[k] === v)); }
    exec() {
      if (this.op === 'insert') { const row = { id: `q-${store[this.table].length + 1}`, ...this.payload }; store[this.table].push(row); return [row]; }
      if (this.op === 'update') { const m = this.matched(); m.forEach((r) => Object.assign(r, this.payload)); return m; }
      if (this.op === 'delete') { const m = this.matched(); store[this.table] = store[this.table].filter((r) => !m.includes(r)); return m; }
      return this.matched();
    }
    async single() { const r = this.exec(); return r.length ? { data: r[0], error: null } : { data: null, error: { message: 'not found' } }; }
    async maybeSingle() { const r = this.exec(); return { data: r.length ? r[0] : null, error: null }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB, emails };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireUser: vi.fn(async () => ({ id: 'user-op', email: 'op@synthetic.example' })),
}));
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async (m: any) => { h.emails.push(m); return { success: true }; }),
  emailTemplates: { quoteReceived: vi.fn(() => ({ subject: 'Quote', html: '<p>q</p>' })) },
  getAppBaseUrl: vi.fn(() => 'http://localhost'),
}));
vi.mock('@/lib/email-helpers', () => ({ generateTripViewLink: vi.fn(async () => 'http://localhost/trips/view?token=x') }));
vi.mock('@/lib/event-logger', () => ({ logEvent: vi.fn(async () => {}) }));

import { POST } from '@/app/api/operator/quote/route';

const REQ = {
  pending: '11111111-1111-4111-8111-111111111111',
  cancelled: '22222222-2222-4222-8222-222222222222',
  completed: '33333333-3333-4333-8333-333333333333',
};
function seed() {
  h.store.operator_profiles = [{ id: 'user-op', operator_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }];
  h.store.operators = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', company_name: 'Synthetic Transit' }];
  h.store.quotes = [];
  h.store.notifications = [];
  h.emails.length = 0;
  h.store.transport_requests = Object.entries(REQ).map(([status, id]) => ({
    id, status, user_id: 'rider-1', metadata_private: {},
    userProfile: { email: 'rider@synthetic.example', full_name: 'Rider One' },
  }));
}
function quote(requestId: string) {
  const req = new NextRequest('http://localhost/api/operator/quote', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ request_id: requestId, total_price: 150, vehicle_type: 'Van' }),
  });
  return POST(req);
}
const quotesFor = (id: string) => h.store.quotes.filter((q) => q.request_id === id).length;

describe('dashboard quote on closed request probe', () => {
  beforeEach(seed);
  it('control: quote on OPEN (pending) request -> 200, one quote row', async () => {
    const res = await quote(REQ.pending);
    expect(res.status).toBe(200);
    expect(quotesFor(REQ.pending)).toBe(1);
  });
  it('attack: quote on CANCELLED request -> refused, no quote row, no rider email/notification', async () => {
    const res = await quote(REQ.cancelled);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(quotesFor(REQ.cancelled)).toBe(0);
    expect(h.emails.length).toBe(0);
    expect(h.store.notifications.length).toBe(0);
  });
  it('attack: quote on COMPLETED request -> refused, no quote row, no rider email/notification', async () => {
    const res = await quote(REQ.completed);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(quotesFor(REQ.completed)).toBe(0);
    expect(h.emails.length).toBe(0);
    expect(h.store.notifications.length).toBe(0);
  });
});
