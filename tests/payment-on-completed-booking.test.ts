/**
 * LOOP PROBE — cycle 2026-11-06-0352 (completed-state variation) (Businto)
 * Scenario: routing-fee payment initiated for a COMPLETED booking via the
 * two sibling payment routes the BUS-CREATE-INTENT-STATE-001 fix cited as
 * stating the contract — POST /api/payments/booking-checkout and
 * POST /api/payments/seamless.
 * Both routes refuse payment_status='paid' and CAS-claim only
 * payment_status in ('unpaid','pending'), but neither reads booking.status.
 * A completed booking whose fee was never paid (payment_status='unpaid')
 * therefore passes the CAS: checkout creates a live Stripe Checkout Session
 * for a dead trip, and seamless actually charges the saved card $1.99
 * off-session and marks the completed booking 'paid'.
 * The create-intent fix (landed f3a2e3dd) states the contract for its route:
 * terminal bookings ('completed'/'completed') are refused 409 before any
 * Stripe call. This probe tests whether the siblings honour the same rule.
 *
 * Invariant: a routing-fee payment may be initiated only for a live,
 * unpaid booking; a completed booking must be refused with no Stripe
 * session/charge and no change to its payment_status.
 * Harness: in-memory mocked Supabase (with .in() CAS support) + mocked
 * Stripe; synthetic bookings only, no real charges.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { bookings: [], profiles: [] };
  const stripeCalls: { sessions: any[]; charges: any[] } = { sessions: [], charges: [] };
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; inFilters: Array<[string, any[]]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    in(k: string, vs: any[]) { this.inFilters.push([k, vs]); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    match(r: Row) {
      return this.filters.every(([k, v]) => r[k] === v) && this.inFilters.every(([k, vs]) => vs.includes(r[k]));
    }
    exec() {
      const rows = store[this.table] || [];
      if (this.op === 'update') { const m = rows.filter((r) => this.match(r)); m.forEach((r) => Object.assign(r, this.payload)); return m; }
      return rows.filter((r) => this.match(r));
    }
    async single() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB, stripeCalls };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
}));
vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: { sessions: { create: async (args: any) => { h.stripeCalls.sessions.push(args); return { id: 'cs_new', url: 'https://checkout.example/cs_new' }; } } },
    customers: {
      list: async () => ({ data: [] }),
      create: async () => ({ id: 'cus_new' }),
      retrieve: async () => ({ invoice_settings: { default_payment_method: 'pm_1' } }),
    },
    paymentMethods: { list: async () => ({ data: [{ id: 'pm_1' }] }) },
    paymentIntents: { create: async (args: any) => { h.stripeCalls.charges.push(args); return { status: 'succeeded', client_secret: 'cs_pi' }; } },
  },
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } }),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }));
vi.mock('@/lib/event-logger', () => ({ logEvent: async () => {} }));
vi.mock('@/lib/email', () => ({ getAppBaseUrl: () => 'http://localhost' }));

import { POST as checkoutPOST } from '@/app/api/payments/booking-checkout/route';
import { POST as seamlessPOST } from '@/app/api/payments/seamless/route';

function seed() {
  h.stripeCalls.sessions.length = 0;
  h.stripeCalls.charges.length = 0;
  const user = { id: 'user-1', email: 'rider@example.com', full_name: 'Rider', stripe_customer_id: 'cus_1' };
  const base = { user_id: 'user-1', amount: 100, confirmation_code: 'CONF-1', request_id: 'req-1', user, operator: { company_name: 'Op' } };
  h.store.bookings = [
    { ...base, id: 'bk-live-checkout', status: 'confirmed', payment_status: 'unpaid' },
    { ...base, id: 'bk-completed-checkout', status: 'completed', payment_status: 'unpaid' },
    { ...base, id: 'bk-live-seamless', status: 'confirmed', payment_status: 'unpaid' },
    { ...base, id: 'bk-completed-seamless', status: 'completed', payment_status: 'unpaid' },
  ];
  h.store.profiles = [{ id: 'user-1', stripe_customer_id: 'cus_1' }];
}
function reqFor(url: string, bookingId: string) {
  return new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bookingId }) });
}
const booking = (id: string) => h.store.bookings.find((b) => b.id === id)!;

describe('routing-fee payment on completed booking (checkout + seamless siblings)', () => {
  beforeEach(seed);
  it('control checkout: live UNPAID booking gets a checkout session, fee claimed', async () => {
    const res = await checkoutPOST(reqFor('http://localhost/api/payments/booking-checkout', 'bk-live-checkout'));
    expect(res.status).toBe(200);
    expect(h.stripeCalls.sessions.length).toBe(1);
  });
  it('attack checkout: COMPLETED booking is refused — no Stripe session, payment_status unchanged', async () => {
    const res = await checkoutPOST(reqFor('http://localhost/api/payments/booking-checkout', 'bk-completed-checkout'));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.stripeCalls.sessions.length).toBe(0);
    expect(booking('bk-completed-checkout').payment_status).toBe('unpaid');
  });
  it('control seamless: live UNPAID booking is charged once and succeeds', async () => {
    const res = await seamlessPOST(reqFor('http://localhost/api/payments/seamless', 'bk-live-seamless'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('success');
    expect(h.stripeCalls.charges.length).toBe(1);
    expect(booking('bk-live-seamless').payment_status).toBe('paid');
  });
  it('attack seamless: COMPLETED booking is refused — no charge, payment_status unchanged', async () => {
    const res = await seamlessPOST(reqFor('http://localhost/api/payments/seamless', 'bk-completed-seamless'));
    expect(h.stripeCalls.charges.length).toBe(0);
    expect(booking('bk-completed-seamless').payment_status).toBe('unpaid');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
