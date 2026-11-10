/**
 * REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-09-1252; Phase 2 payment discipline (M3) — Businto
 * Scenario (scout queue candidate businto/seamless-processing-strand,
 * Tier-1 Cloudflare audit 2026-11-09, status unconfirmed — this probe is
 * the loop's own deterministic test of the claim):
 * POST /api/payments/seamless CAS-claims a booking (payment_status ->
 * 'processing', only from 'unpaid'/'pending'), then returns
 * requires_payment_method on the no_saved_card and no_payment_methods
 * exits WITHOUT reverting the claim — only the Stripe-error catch
 * reverts to 'unpaid'. The booking strands in 'processing' with no
 * payment in flight, and booking-checkout CAS-claims only from
 * 'unpaid'/'pending' too, so the fallback can never pay it either.
 *
 * Invariant: a payment claim must be released on every non-charge exit;
 * a booking must not strand in 'processing' with no payment in flight,
 * and the checkout fallback must remain usable afterwards.
 * Harness: in-memory mocked Supabase (with .in() CAS support) + mocked
 * Stripe with configurable saved-card / payment-method / error modes;
 * synthetic bookings only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { bookings: [], profiles: [] };
  const stripeCalls: { sessions: any[]; charges: any[] } = { sessions: [], charges: [] };
  let pmList: any[] = [{ id: 'pm_1' }];
  let piBehavior: 'succeed' | 'throw' = 'succeed';
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
  return {
    store, QB, stripeCalls,
    get pmList() { return pmList; }, set pmList(v: any[]) { pmList = v; },
    get piBehavior() { return piBehavior; }, set piBehavior(v: 'succeed' | 'throw') { piBehavior = v; },
  };
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
    paymentMethods: { list: async () => ({ data: h.pmList }) },
    paymentIntents: {
      create: async (args: any) => {
        h.stripeCalls.charges.push(args);
        if (h.piBehavior === 'throw') { const e: any = new Error('card declined'); e.code = 'card_declined'; throw e; }
        return { status: 'succeeded', client_secret: 'cs_pi' };
      },
    },
  },
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } }),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }));
vi.mock('@/lib/event-logger', () => ({ logEvent: async () => {} }));
vi.mock('@/lib/email', () => ({ getAppBaseUrl: () => 'http://localhost' }));

import { POST as seamlessPOST } from '@/app/api/payments/seamless/route';
import { POST as checkoutPOST } from '@/app/api/payments/booking-checkout/route';

function seed() {
  h.stripeCalls.sessions.length = 0;
  h.stripeCalls.charges.length = 0;
  h.pmList = [{ id: 'pm_1' }];
  h.piBehavior = 'succeed';
  const withCard = { id: 'user-1', email: 'rider@example.com', full_name: 'Rider', stripe_customer_id: 'cus_1' };
  const noCard = { id: 'user-1', email: 'rider@example.com', full_name: 'Rider', stripe_customer_id: null };
  const base = { user_id: 'user-1', amount: 100, confirmation_code: 'CONF-1', request_id: 'req-1', status: 'confirmed', operator: { company_name: 'Op' } };
  h.store.bookings = [
    { ...base, id: 'bk-ok', payment_status: 'unpaid', user: withCard },
    { ...base, id: 'bk-stripe-err', payment_status: 'unpaid', user: withCard },
    { ...base, id: 'bk-nocard', payment_status: 'unpaid', user: noCard },
    { ...base, id: 'bk-nopm', payment_status: 'unpaid', user: withCard },
  ];
  h.store.profiles = [{ id: 'user-1', stripe_customer_id: 'cus_1', email: 'rider@example.com', full_name: 'Rider' }];
}
function reqFor(url: string, bookingId: string) {
  return new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bookingId }) });
}
function statusOf(id: string) { return h.store.bookings.find((b) => b.id === id)?.payment_status; }

describe('seamless payment must release its claim on every non-charge exit', () => {
  beforeEach(seed);
  it('control: saved card charges once, succeeds, booking ends paid', async () => {
    const res = await seamlessPOST(reqFor('http://localhost/api/payments/seamless', 'bk-ok'));
    const body = await res.json();
    expect(body.status).toBe('success');
    expect(h.stripeCalls.charges.length).toBe(1);
    expect(statusOf('bk-ok')).toBe('paid');
  });
  it('control: Stripe error reverts the claim to unpaid (existing correct path)', async () => {
    h.piBehavior = 'throw';
    const res = await seamlessPOST(reqFor('http://localhost/api/payments/seamless', 'bk-stripe-err'));
    const body = await res.json();
    expect(body.status).toBe('requires_payment_method');
    expect(statusOf('bk-stripe-err')).toBe('unpaid');
  });
  it('attack A: no_saved_card exit must not strand the booking in processing', async () => {
    const res = await seamlessPOST(reqFor('http://localhost/api/payments/seamless', 'bk-nocard'));
    const body = await res.json();
    expect(body.status).toBe('requires_payment_method');
    expect(body.error).toBe('no_saved_card');
    expect(statusOf('bk-nocard')).toBe('unpaid');
  });
  it('attack B: no_payment_methods exit must not strand the booking in processing', async () => {
    h.pmList = [];
    const res = await seamlessPOST(reqFor('http://localhost/api/payments/seamless', 'bk-nopm'));
    const body = await res.json();
    expect(body.status).toBe('requires_payment_method');
    expect(body.error).toBe('no_payment_methods');
    expect(statusOf('bk-nopm')).toBe('unpaid');
  });
  it('attack C: after a no-card seamless exit, the checkout fallback must still be able to create a session', async () => {
    await seamlessPOST(reqFor('http://localhost/api/payments/seamless', 'bk-nocard'));
    const res = await checkoutPOST(reqFor('http://localhost/api/payments/booking-checkout', 'bk-nocard'));
    const body = await res.json();
    expect(h.stripeCalls.sessions.length).toBe(1);
    expect(body.sessionId).toBe('cs_new');
  });
});
