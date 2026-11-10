/**
 * REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-08-0952; Phase 1 write core (src/lib/transitions.ts) — Businto
 * POST /api/quotes/accept: concurrent acceptance of two DIFFERENT pending
 * quotes for the same request (rider double-tap / two tabs / retry storm).
 * The route guards the booked write (.neq status 'booked') and predicates
 * its own quote-accept write on status='pending', BUT its
 * decline-all-other-quotes update carries NO status predicate:
 *   .update({status:'declined'}).eq('request_id',...).neq('id', quoteId)
 * so a competing accept that runs inside the first accept's window flips
 * an already-ACCEPTED quote to 'declined' and notifies its operator.
 * Interleaving (deterministic): accept B runs in full at the moment
 * accept A executes its decline-others update — after A marked its quote
 * accepted, before A writes 'booked'. B sees the request still open and
 * its quote still pending, so B legitimately proceeds; B's own
 * decline-others then flips A's accepted quote, B books, and A resumes:
 * A's decline-others flips B's accepted quote too, A's booked write is
 * refused (409) — final state: request booked, ONE booking (B's), but
 * ZERO accepted quotes, and BOTH operators received quote_declined.
 * Invariant: a booked request has exactly one accepted quote — the
 * booking's quote — and the winning operator is never told they lost.
 * Harness: in-memory mocked Supabase (1552 accept-probe pattern), session
 * auth as the request owner; interleaving applied at update execution.
 * NOTE (cycle 2026-11-08-0952): this probe was NEVER EXECUTED — the
 * vitest harness was environment-blocked (EPERM at suite load, all
 * suites incl. a trivial test, canonical clone included). Preserved
 * verbatim for the next cycle. Do not treat as a result.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = {
    transport_requests: [], quotes: [], bookings: [], notifications: [],
  };
  let seq = 0;
  let hook: (() => Promise<void>) | null = null;

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
    isDeclineOthers() {
      return this.table === 'quotes' && this.op === 'update'
        && this.payload?.status === 'declined'
        && this.filters.some(([t]) => t === 'neq');
    }
    exec() {
      const rows = store[this.table];
      if (this.op === 'insert') {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload];
        return items.map((it) => { const row = { id: `row-${++seq}`, ...it }; rows.push(row); return row; });
      }
      const matched = rows.filter((r) => this.match(r));
      if (this.op === 'update') matched.forEach((r) => Object.assign(r, this.payload));
      // snapshot copies so later writes don't mutate earlier reads
      return matched.map((r) => ({ ...r }));
    }
    async pre() { if (hook && this.isDeclineOthers()) { const f = hook; hook = null; await f(); } }
    async single() { await this.pre(); const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }; }
    async maybeSingle() { await this.pre(); const rows = this.exec(); return { data: rows.length ? rows[0] : null, error: null }; }
    then(res: any, rej: any) { this.pre().then(() => { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }, rej); }
  }
  return { store, QB, setHook: (f: any) => { hook = f; } };
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
const OP_B = { id: 'op-B', company_name: 'Op B', company_email: 'b@example.com', company_phone: '555', profile: null };

function seed() {
  h.store.transport_requests = [
    { id: 'req-1', status: 'quoted', user_id: 'user-1', metadata_private: {}, pickup_fuzzy: 'P', dropoff_fuzzy: 'D', start_date: '2026-12-01', start_time: '08:00' },
  ];
  h.store.quotes = [
    { id: 'quote-A', request_id: 'req-1', operator_id: 'op-A', status: 'pending', total_price: 100, expires_at: null, operator: OP_A },
    { id: 'quote-B', request_id: 'req-1', operator_id: 'op-B', status: 'pending', total_price: 120, expires_at: null, operator: OP_B },
  ];
  h.store.bookings = [];
  h.store.notifications = [];
  h.setHook(null);
}
function accept(quoteId: string) {
  const req = new NextRequest('http://localhost:3000/api/quotes/accept', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quoteId, tripRequestId: 'req-1' }),
  });
  return POST(req);
}
const quote = (id: string) => h.store.quotes.find((q) => q.id === id)!;
const declinedNotifsFor = (op: string) =>
  h.store.notifications.filter((n) => n.user_id === op && n.type === 'quote_declined').length;

describe('quotes/accept concurrent double-accept', () => {
  beforeEach(() => seed());

  it('control: single accept books exactly its quote', async () => {
    const res = await accept('quote-A');
    expect(res.status).toBe(200);
    expect(quote('quote-A').status).toBe('accepted');
    expect(quote('quote-B').status).toBe('declined');
    expect(h.store.bookings).toHaveLength(1);
    expect(h.store.bookings[0].quote_id).toBe('quote-A');
    expect(h.store.transport_requests[0].status).toBe('booked');
  });

  it('sequential control: second accept after booking is refused, winner stays accepted', async () => {
    await accept('quote-A');
    const res2 = await accept('quote-B');
    expect(res2.status).toBe(409);
    expect(quote('quote-A').status).toBe('accepted');
    expect(h.store.bookings).toHaveLength(1);
  });

  it('attack: concurrent double-accept leaves exactly one accepted quote — the booking quote', async () => {
    let resB: any = null;
    h.setHook(async () => { resB = await accept('quote-B'); });
    const resA = await accept('quote-A');
    // exactly one winner returns 200, exactly one booking exists
    expect([resA.status, resB.status].sort()).toEqual([200, 409]);
    expect(h.store.bookings).toHaveLength(1);
    // THE INVARIANT: the booking's quote is accepted, and it is the only one
    const bookingQuote = quote(h.store.bookings[0].quote_id);
    expect(bookingQuote.status).toBe('accepted');
    expect(h.store.quotes.filter((q) => q.status === 'accepted')).toHaveLength(1);
    // the winning operator was never told their quote was declined
    expect(declinedNotifsFor(h.store.bookings[0].operator_id)).toBe(0);
  });
});
