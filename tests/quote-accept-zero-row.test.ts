/**
 * REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-09-0052; Phase 1 write core (src/lib/transitions.ts) — Businto
 * Scenario: quote ACCEPT racing quote DECLINE on the same quote (mirror
 * of BUS-DECLINE-ACCEPT-RACE-001, opposite direction).
 * POST /api/quotes/accept reads the quote, refuses unless it is
 * 'pending', then UPDATEs with a status predicate
 * (.eq('id', quoteId).eq('status','pending')) — but it checks only the
 * update ERROR, never how many rows the update touched (the call does
 * not even .select() the updated row). If the operator's decline (or an
 * expiry) lands between the accept's read and its write, the predicated
 * update correctly matches 0 rows, yet the route proceeds: it declines
 * the other quotes, flips the request to 'booked', inserts a booking
 * for the declined quote, notifies the operator their quote was
 * accepted, and returns 200 success.
 *
 * Invariant: an accept whose predicated quote update transitions 0 rows
 * must not book the request, must not create a booking, and must not
 * report success; the quote keeps its winning (declined) status.
 * Harness: in-memory fake supabase (2152 accept-probe pattern); the
 * interleaved decline is applied at the moment the accept's predicated
 * update executes, exactly as the real DB predicate would see it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = {
    transport_requests: [], quotes: [], bookings: [], notifications: [],
  };
  let seq = 0;
  let interleaveDecline = false;

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
      if (this.op === 'update' && interleaveDecline && this.table === 'quotes' && this.payload?.status === 'accepted') {
        // The competing decline lands first, inside the read->write
        // window: the quote leaves 'pending' before this update's
        // predicate is evaluated, so the update matches 0 rows.
        const q = rows.find((r) => r.id === 'quote-A');
        if (q) q.status = 'declined';
        interleaveDecline = false;
      }
      const matched = rows.filter((r) => this.match(r));
      if (this.op === 'update') matched.forEach((r) => Object.assign(r, this.payload));
      return matched.map((r) => ({ ...r }));
    }
    async single() {
      const rows = this.exec();
      return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } };
    }
    async maybeSingle() { const rows = this.exec(); return { data: rows.length ? rows[0] : null, error: null }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB, setInterleave: (v: boolean) => { interleaveDecline = v; } };
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
  h.setInterleave(false);
}
function accept(quoteId: string) {
  const req = new NextRequest('http://localhost:3000/api/quotes/accept', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quoteId, tripRequestId: 'req-1' }),
  });
  return POST(req);
}

describe('quotes/accept vs decline race (0-row predicated write ignored)', () => {
  beforeEach(() => seed());

  it('control: accept of a pending quote -> 200, quote accepted, exactly one booking', async () => {
    const res = await accept('quote-A');
    expect(res.status).toBe(200);
    expect(h.store.quotes[0].status).toBe('accepted');
    expect(h.store.bookings).toHaveLength(1);
    expect(h.store.transport_requests[0].status).toBe('booked');
  });

  it('control: sequential accept of an already-declined quote -> 409, no booking', async () => {
    h.store.quotes[0].status = 'declined';
    const res = await accept('quote-A');
    expect(res.status).toBe(409);
    expect(h.store.bookings).toHaveLength(0);
    expect(h.store.transport_requests[0].status).toBe('quoted');
  });

  it('attack: decline lands between accept read and write -> accept must not book or succeed', async () => {
    h.setInterleave(true);
    const res = await accept('quote-A');
    // The decline won the race and must stand.
    expect(h.store.quotes[0].status).toBe('declined');
    // THE INVARIANT: a 0-row accept transition books nothing.
    expect(h.store.bookings).toHaveLength(0);
    expect(h.store.transport_requests[0].status).toBe('quoted');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
