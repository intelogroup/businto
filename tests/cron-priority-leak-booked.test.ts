/**
 * REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-07-1252; Phase 1 write core (src/lib/transitions.ts) — Businto
 * Scenario: GET /api/cron/process-priority-leaks Process 1 fetches every
 * pending transport_request whose priority window has expired and that has
 * not yet leaked, ONCE, then loops sequentially: matching operators,
 * sending each free operator a claim-link email + in-app notification, and
 * only then marking notified_standard_network=true BY ID ONLY (no status
 * predicate, no re-check). A rider who accepts a quote for request #2
 * (pending -> booked) while the cron is emailing operators for request #1
 * still has request #2 leaked to the standard network: operators receive
 * claim links / quote invitations for a trip that is already booked.
 * Invariant: a request no longer pending at process time must not be
 * leaked to the standard network (no operator emails/notifications for it).
 * Harness: in-memory fake supabase, snapshot select semantics; sendEmail
 * capture sink whose first call performs the interleaved booking.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { transport_requests: [], notifications: [] };
  const sends: any[] = [];
  let onFirstSend: (() => void) | null = null;
  class QB {
    table: string; op = 'select'; filters: Array<(r: Row) => boolean> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push(r => r[k] === v); return this; }
    in(k: string, vs: any[]) { this.filters.push(r => vs.includes(r[k])); return this; }
    lte(k: string, v: any) { this.filters.push(r => r[k] <= v); return this; }
    gte(k: string, v: any) { this.filters.push(r => r[k] >= v); return this; }
    or() { return this; }
    order() { return this; } limit() { return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
    exec() {
      const rows = store[this.table] || (store[this.table] = []);
      const matched = rows.filter(r => this.filters.every(f => f(r)));
      if (this.op === 'update') { matched.forEach(r => Object.assign(r, this.payload)); return matched; }
      if (this.op === 'insert') { const items = Array.isArray(this.payload) ? this.payload : [this.payload]; items.forEach(it => rows.push(it)); return items; }
      return matched.map(r => ({ ...r }));
    }
    async single() { const r = this.exec(); return r.length ? { data: r[0], error: null } : { data: null, error: { message: 'not found' } }; }
    async maybeSingle() { const r = this.exec(); return { data: r.length ? r[0] : null, error: null }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, sends, QB, setOnFirstSend: (fn: (() => void) | null) => { onFirstSend = fn; }, fireFirstSend: () => { const f = onFirstSend; onFirstSend = null; if (f) f(); } };
});

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (t: string) => new h.QB(t) }, requireUser: vi.fn(), requireAdmin: vi.fn() }));
vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: { from: (t: string) => new h.QB(t) }, requireUser: vi.fn(), requireAdmin: vi.fn() }));
vi.mock('@/lib/event-logger', () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/operator-matching', () => ({
  findMatchingOperators: vi.fn(async () => [{ id: 'op-1', company_name: 'Free Op', company_email: 'op@example.test', is_partner: false, profile_id: 'prof-1' }]),
  extractRequirements: vi.fn(() => []),
}));
vi.mock('@/lib/tokens', () => ({ generateOperatorViewToken: vi.fn(async () => 'tok') }));
vi.mock('@/lib/email-helpers', () => ({ generateOperatorQuoteLink: vi.fn(async () => 'http://localhost/quote') }));
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async (m: any) => { h.sends.push(m); h.fireFirstSend(); return { id: 'mock' }; }),
  emailTemplates: { operatorNewRequest: () => ({ subject: 'new request', html: 'h' }) },
  getAppBaseUrl: () => 'http://localhost',
}));

import { GET } from '@/app/api/cron/process-priority-leaks/route';

const SECRET = 'test-cron-secret-1252';
const past = new Date(Date.now() - 3600e3).toISOString();

function reqRow(id: string) {
  return {
    id, status: 'pending', service_type: 'school', user_id: `u-${id}`,
    created_at: '2026-10-01T00:00:00Z', start_date: '2026-11-10', start_time: '08:00',
    pickup_address: '1 Main St, Everett', dropoff_address: '2 Oak St, Everett',
    pickup_fuzzy: 'Everett', dropoff_fuzzy: 'Everett', metadata: {},
    notified_standard_network: false, admin_alerted: true,
    priority_window_ends_at: past,
  };
}
function seed() {
  h.sends.length = 0;
  h.setOnFirstSend(null);
  h.store.notifications = [];
  h.store.transport_requests = [reqRow('req-1'), reqRow('req-2')];
}
const rq = (id: string) => h.store.transport_requests.find(r => r.id === id)!;
function call() {
  return GET(new Request('http://localhost/api/cron/process-priority-leaks', { headers: { authorization: `Bearer ${SECRET}` } }));
}

describe('cron priority-leak leaks interleaved booking probe', () => {
  beforeEach(() => { seed(); process.env.VERCEL_CRON_SECRET = SECRET; });
  afterEach(() => { delete process.env.VERCEL_CRON_SECRET; });

  it('control: both expired pending requests leak to standard network (200, 2 operator emails, both marked notified)', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.sends.length).toBe(2);
    expect(rq('req-1').notified_standard_network).toBe(true);
    expect(rq('req-2').notified_standard_network).toBe(true);
    expect(h.store.notifications.length).toBe(2);
  });

  it('attack: rider accepts a quote for req-2 (booked) while cron emails operators for req-1 — req-2 must NOT be leaked', async () => {
    h.setOnFirstSend(() => { rq('req-2').status = 'booked'; });
    const res = await call();
    expect(res.status).toBe(200);
    expect(rq('req-1').notified_standard_network).toBe(true);
    // Invariant assertions: no leak for the booked request
    expect(h.sends.length).toBe(1);
    expect(h.store.notifications.length).toBe(1);
    expect(rq('req-2').notified_standard_network).toBe(false);
  });
});
