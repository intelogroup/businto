/**
 * REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-07-0652; Phase 1 write core (src/lib/transitions.ts) — Businto
 * Scenario: GET /api/cron/process-completed-trips Process 2 fetches every
 * pending/quoted expired transport_request once, then loops sequentially —
 * updating each request to 'cancelled' BY ID ONLY (no status predicate)
 * and sending a request-expired email. The per-request email send is a
 * real time window: a rider who accepts a quote for request #2 (request
 * pending/quoted -> booked, the legal accept transition) while the cron
 * is still emailing request #1 has that booking silently overwritten —
 * request ends 'cancelled' despite being booked, and the rider receives
 * an expiration email for a booked trip.
 * Invariant: a request no longer pending/quoted at write time must not
 * be auto-cancelled; a 'booked' state survives the cron, no expiry email.
 * Harness: in-memory fake supabase, snapshot select semantics; sendEmail
 * capture sink whose first call performs the interleaved booking.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { bookings: [], transport_requests: [] };
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
      const rows = store[this.table];
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
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async (m: any) => { h.sends.push(m); h.fireFirstSend(); return { id: 'mock' }; }),
  emailTemplates: { tripCompletedFollowUp: () => ({ subject: 's', html: 'h' }), requestExpired: () => ({ subject: 'expired', html: 'h' }) },
  getAppBaseUrl: () => 'http://localhost',
}));

import { GET } from '@/app/api/cron/process-completed-trips/route';

const SECRET = 'test-cron-secret-0652';
const pastDate = new Date(Date.now() - 3 * 24 * 3600e3).toISOString().split('T')[0];

function reqRow(id: string, email: string) {
  return {
    id, status: 'pending', service_type: 'medical', user_id: `u-${id}`,
    created_at: '2026-10-01T00:00:00Z', start_date: pastDate, metadata_private: {},
    profiles: { email, full_name: 'Rider' },
  };
}
function seed() {
  h.sends.length = 0;
  h.setOnFirstSend(null);
  h.store.bookings = [];
  h.store.transport_requests = [reqRow('req-1', 'rider1@example.test'), reqRow('req-2', 'rider2@example.test')];
}
const rq = (id: string) => h.store.transport_requests.find(r => r.id === id)!;
function call() {
  return GET(new Request('http://localhost/api/cron/process-completed-trips', { headers: { authorization: `Bearer ${SECRET}` } }));
}

describe('cron auto-cancel overwrites interleaved booking probe', () => {
  beforeEach(() => { seed(); process.env.VERCEL_CRON_SECRET = SECRET; });
  afterEach(() => { delete process.env.VERCEL_CRON_SECRET; });

  it('control: both expired pending requests auto-cancel (200, both cancelled, 2 emails)', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(rq('req-1').status).toBe('cancelled');
    expect(rq('req-2').status).toBe('cancelled');
    expect(h.sends.length).toBe(2);
  });

  it('attack: rider accepts a quote for req-2 (booked) while cron emails req-1 — req-2 must stay booked, no expiry email for it', async () => {
    h.setOnFirstSend(() => { rq('req-2').status = 'booked'; });
    const res = await call();
    expect(res.status).toBe(200);
    expect(rq('req-1').status).toBe('cancelled');
    expect(rq('req-2').status).toBe('booked');
    expect(h.sends.length).toBe(1);
  });
});
