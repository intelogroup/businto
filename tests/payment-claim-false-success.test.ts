/**
 * REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-09-0952; Phase 2 payment discipline (M3) — Businto
 * Scenario (scout queue candidate businto/payment-claim-failure-false-success,
 * Tier-1 Cloudflare audit 2026-11-09, status unconfirmed — this probe is the
 * loop's own deterministic test of the claim):
 * Both routing-fee payment routes CAS-claim a booking by setting
 * payment_status='processing' predicated on payment_status in
 * ('unpaid','pending'). On claim failure — zero rows OR a database error
 * (claimErr) — seamless returns {status:'success'} and booking-checkout
 * returns a success URL with alreadyPaid:true, without ever reading the
 * booking's actual payment_status. Zero rows also occurs for bookings in
 * 'failed', 'refunded' or 'processing' — none of which is 'paid'.
 *
 * Invariant: a payment route may report success / alreadyPaid only when
 * the booking's payment has settled or was already verified 'paid'; a
 * failed claim must surface as an error or an in-progress state, never
 * as success, and must make no Stripe call.
 * Harness: in-memory mocked Supabase (with .in() CAS support and a
 * force-claim-error switch) + mocked Stripe; synthetic bookings only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { bookings: [], profiles: [] };
  const stripeCalls: { sessions: any[]; charges: any[] } = { sessions: [], charges: [] };
  let forceClaimError = false;
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
    then(res: any, rej: any) {
      try {
        if (this.op === 'update' && forceClaimError) { res({ data: null, error: { message: 'simulated db error' } }); return; }
        res({ data: this.exec(), error: null });
      } catch (e) { rej(e); }
    }
  }
  return { store, QB, stripeCalls, get forceClaimError() { return forceClaimError; }, set forceClaimError(v: boolean) { forceClaimError = v; } };
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
  h.forceClaimError = false;
  const user = { id: 'user-1', email: 'rider@example.com', full_name: 'Rider', stripe_customer_id: 'cus_1' };
  const base = { user_id: 'user-1', amount: 100, confirmation_code: 'CONF-1', request_id: 'req-1', status: 'confirmed', user, operator: { company_name: 'Op' } };
  h.store.bookings = [
    { ...base, id: 'bk-live-seamless', payment_status: 'unpaid' },
    { ...base, id: 'bk-live-checkout', payment_status: 'unpaid' },
    { ...base, id: 'bk-paid', payment_status: 'paid' },
    { ...base, id: 'bk-failed', payment_status: 'failed' },
    { ...base, id: 'bk-refunded', payment_status: 'refunded' },
    { ...base, id: 'bk-processing', payment_status: 'processing' },
    { ...base, id: 'bk-dberr', payment_status: 'unpaid' },
  ];
  h.store.profiles = [{ id: 'user-1', stripe_customer_id: 'cus_1' }];
}
function reqFor(url: string, bookingId: string) {
  return new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bookingId }) });
}

describe('routing-fee routes must not report success on a failed payment claim', () => {
  beforeEach(seed);
  it('control seamless: live UNPAID booking is charged once and succeeds', async () => {
    const res = await seamlessPOST(reqFor('http://localhost/api/payments/seamless', 'bk-live-seamless'));
    const body = await res.json();
    expect(body.status).toBe('success');
    expect(h.stripeCalls.charges.length).toBe(1);
  });
  it('control checkout: live UNPAID booking gets a real checkout session (not alreadyPaid)', async () => {
    const res = await checkoutPOST(reqFor('http://localhost/api/payments/booking-checkout', 'bk-live-checkout'));
    const body = await res.json();
    expect(h.stripeCalls.sessions.length).toBe(1);
    expect(body.alreadyPaid).toBeUndefined();
    expect(body.sessionId).toBe('cs_new');
  });
  it('control seamless: genuinely PAID booking reports success with no new charge', async () => {
    const res = await seamlessPOST(reqFor('http://localhost/api/payments/seamless', 'bk-paid'));
    const body = await res.json();
    expect(body.status).toBe('success');
    expect(h.stripeCalls.charges.length).toBe(0);
  });
  it('attack seamless: FAILED booking must not report success, no charge', async () => {
    const res = await seamlessPOST(reqFor('http://localhost/api/payments/seamless', 'bk-failed'));
    const body = await res.json();
    expect(body.status).not.toBe('success');
    expect(h.stripeCalls.charges.length).toBe(0);
  });
  it('attack seamless: REFUNDED booking must not report success, no charge', async () => {
    const res = await seamlessPOST(reqFor('http://localhost/api/payments/seamless', 'bk-refunded'));
    const body = await res.json();
    expect(body.status).not.toBe('success');
    expect(h.stripeCalls.charges.length).toBe(0);
  });
  it('attack checkout: FAILED booking must not report alreadyPaid, no session', async () => {
    const res = await checkoutPOST(reqFor('http://localhost/api/payments/booking-checkout', 'bk-failed'));
    const body = await res.json();
    expect(body.alreadyPaid).not.toBe(true);
    expect(h.stripeCalls.sessions.length).toBe(0);
  });
  it('attack checkout: PROCESSING booking must not report alreadyPaid, no session', async () => {
    const res = await checkoutPOST(reqFor('http://localhost/api/payments/booking-checkout', 'bk-processing'));
    const body = await res.json();
    expect(body.alreadyPaid).not.toBe(true);
    expect(h.stripeCalls.sessions.length).toBe(0);
  });
  it('attack seamless: DB ERROR on the claim must not report success, no charge', async () => {
    h.forceClaimError = true;
    const res = await seamlessPOST(reqFor('http://localhost/api/payments/seamless', 'bk-dberr'));
    const body = await res.json();
    expect(body.status).not.toBe('success');
    expect(h.stripeCalls.charges.length).toBe(0);
  });
  it('attack checkout: DB ERROR on the claim must not report alreadyPaid, no session', async () => {
    h.forceClaimError = true;
    const res = await checkoutPOST(reqFor('http://localhost/api/payments/booking-checkout', 'bk-dberr'));
    const body = await res.json();
    expect(body.alreadyPaid).not.toBe(true);
    expect(h.stripeCalls.sessions.length).toBe(0);
  });
});
