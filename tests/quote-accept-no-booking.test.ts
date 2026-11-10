/**
 * REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-08-2152; Phase 1 write core (src/lib/transitions.ts) — Businto
 * POST /api/quotes/accept: booking-insert failure is swallowed.
 * The route marks the quote accepted, declines all other quotes, and
 * flips the request to 'booked', THEN inserts the booking row. On
 * bookingError it only logs (console.error + logEvent) and falls
 * through to the unconditional success response:
 *   return NextResponse.json({ success: true, ... bookingId: booking?.id })
 * so a failed insert yields HTTP 200 success with bookingId undefined,
 * the request booked, the quote accepted — and ZERO booking rows.
 * Invariant: an accept may report success only when a booking exists;
 * a failed booking insert must surface as an error (>=400), never as
 * a successful acceptance with no booking.
 * Harness: in-memory mocked Supabase (0952 accept-probe pattern),
 * session auth as the request owner; bookings insert forced to error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = {
    transport_requests: [], quotes: [], bookings: [], notifications: [],
  };
  let seq = 0;
  let failBookings = false;

  class QB {
    table: string; op = 'select';
    filters: Array<[string, string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push(['eq', k, v]); return this; }
    neq(k: string, v: any) { this.filters.push(['neq', k, v]); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
    match(r: Row) { return this.filters.every(([t, k, v]) => (t === 'eq' ? r[k] === v : r[k] !== v)); }
    exec() {
      const rows = store[this.table];
      if (this.op === 'insert') {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload];
        return items.map((it) => { const row = { id: `row-${++seq}`, ...it }; rows.push(row); return row; });
      }
      const matched = rows.filter((r) => this.match(r));
      if (this.op === 'update') matched.forEach((r) => Object.assign(r, this.payload));
      return matched.map((r) => ({ ...r }));
    }
    async single() {
      if (this.table === 'bookings' && this.op === 'insert' && failBookings) {
        return { data: null, error: { message: 'insert failed: duplicate key (simulated)' } };
      }
      const rows = this.exec();
      return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } };
    }
    async maybeSingle() { const rows = this.exec(); return { data: rows.length ? rows[0] : null, error: null }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB, setFailBookings: (v: boolean) => { failBookings = v; } };
});

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (t: string) => new h.QB(t) } }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}));
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async () => ({ id: 'mock-email' })),
  emailTemplates: { bookingConfirmation: () => ({ subject: 's', html: 'h' }) },
  getAppBaseUrl: () => 'http://localhost:3000',
}));
vi.mock('@/lib/sms', () => ({ sendSMS: vi.fn(async () => ({})), smsTemplates: { quoteAccepted: () => ({ body: 'x' }) } }));
vi.mock('@/lib/event-logger', () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/tokens', () => ({ verifyUserTripToken: vi.fn(async () => null) }));
vi.mock('@/lib/app-settings', () => ({ getDispatchMode: vi.fn(async () => false) }));

import { POST } from '@/app/api/quotes/accept/route';

const OP_A = { id: 'op-A', company_name: 'Op A', company_email: 'a@example.com', company_phone: '555', profile: null };

function seed() {
  h.store.transport_requests = [
    { id: 'req-1', status: 'quoted', user_id: 'user-1', metadata_private: {}, pickup_fuzzy: 'P', dropoff_fuzzy: 'D', start_date: '2026-12-01', start_time: '08:00' },
  ];
  h.store.quotes = [
    { id: 'quote-A', request_id: 'req-1', operator_id: 'op-A', status: 'pending', total_price: 100, expires_at: null, operator: OP_A },
  ];
  h.store.bookings = [];
  h.store.notifications = [];
  h.setFailBookings(false);
}
function accept(quoteId: string) {
  const req = new NextRequest('http://localhost:3000/api/quotes/accept', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quoteId, tripRequestId: 'req-1' }),
  });
  return POST(req);
}

describe('quotes/accept booking-insert failure', () => {
  beforeEach(() => seed());

  it('control: successful insert returns 200 with exactly one booking', async () => {
    const res = await accept('quote-A');
    expect(res.status).toBe(200);
    expect(h.store.bookings).toHaveLength(1);
    expect(h.store.transport_requests[0].status).toBe('booked');
  });

  it('attack: failed booking insert must not report success', async () => {
    h.setFailBookings(true);
    const res = await accept('quote-A');
    const body = await res.json().catch(() => ({}));
    // THE INVARIANT: no booking row exists, so success is a lie.
    expect(h.store.bookings).toHaveLength(0);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(body.success).not.toBe(true);
  });
});
