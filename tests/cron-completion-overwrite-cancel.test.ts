/**
 * REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-07-0352; Phase 1 write core (src/lib/transitions.ts) — Businto
 * Scenario: GET /api/cron/process-completed-trips fetches every confirmed /
 * in_progress booking once, then loops sequentially — updating each booking
 * and its transport_request to 'completed' BY ID ONLY (no status predicate
 * on either write) and sending a trip-completed follow-up email. The loop's
 * per-booking email send is a real time window: a rider who cancels booking
 * #2 (PATCH /api/bookings, confirmed -> cancelled, the one legal user
 * transition) while the cron is still emailing booking #1 has that
 * cancellation silently overwritten — booking and request end 'completed'
 * and the rider receives a "trip completed" follow-up for a trip they
 * cancelled.
 * Invariant: a booking that is no longer confirmed/in_progress at write
 * time must not be transitioned to completed; a terminal 'cancelled' state
 * survives the completion cron, and no completion email is sent for it.
 * Harness: in-memory fake supabase with snapshot select semantics (fetched
 * rows are copies, as PostgREST returns); sendEmail is a capture sink whose
 * first call performs the interleaved cancellation, exactly where wall-clock
 * time passes in production.
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
      // Snapshot semantics: callers receive copies, not live store rows.
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
  emailTemplates: { tripCompletedFollowUp: () => ({ subject: 's', html: 'h' }), requestExpired: () => ({ subject: 's', html: 'h' }) },
  getAppBaseUrl: () => 'http://localhost',
}));

import { GET } from '@/app/api/cron/process-completed-trips/route';

const SECRET = 'test-cron-secret-0352b';
const pastDate = new Date(Date.now() - 3 * 24 * 3600e3).toISOString().split('T')[0];

function booking(id: string, reqId: string, email: string) {
  return {
    id, status: 'confirmed', request_id: reqId, created_at: '2026-10-01T00:00:00Z',
    user: { id: `u-${id}`, email, full_name: 'Rider' },
    operator: { id: 'op-1', company_name: 'Op' },
    request: { id: reqId, start_date: pastDate, end_date: pastDate, start_time: '09:00' },
  };
}
function seed() {
  h.sends.length = 0;
  h.setOnFirstSend(null);
  h.store.bookings = [booking('bk-1', 'req-1', 'rider1@example.test'), booking('bk-2', 'req-2', 'rider2@example.test')];
  h.store.transport_requests = [
    { id: 'req-1', status: 'booked' },
    { id: 'req-2', status: 'booked' },
  ];
}
const bk = (id: string) => h.store.bookings.find(r => r.id === id)!;
const rq = (id: string) => h.store.transport_requests.find(r => r.id === id)!;
function call() {
  return GET(new Request('http://localhost/api/cron/process-completed-trips', { headers: { authorization: `Bearer ${SECRET}` } }));
}

describe('cron completion overwrites interleaved cancellation probe', () => {
  beforeEach(() => { seed(); process.env.VERCEL_CRON_SECRET = SECRET; });
  afterEach(() => { delete process.env.VERCEL_CRON_SECRET; });

  it('control: both past-due confirmed bookings complete (200, both completed, 2 emails)', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(bk('bk-1').status).toBe('completed');
    expect(bk('bk-2').status).toBe('completed');
    expect(rq('req-2').status).toBe('completed');
    expect(h.sends.length).toBe(2);
  });

  it('attack: rider cancels bk-2 while the cron emails bk-1 — bk-2 must stay cancelled, no completion email for it', async () => {
    // Interleaved rider cancellation: lands after the cron's fetch, during
    // the first booking's email send — before the cron writes bk-2.
    h.setOnFirstSend(() => { bk('bk-2').status = 'cancelled'; });
    const res = await call();
    expect(res.status).toBe(200);
    expect(bk('bk-1').status).toBe('completed');
    expect(bk('bk-2').status).toBe('cancelled');
    expect(rq('req-2').status).not.toBe('completed');
    expect(h.sends.length).toBe(1);
  });
});
