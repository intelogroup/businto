/**
 * PERMANENT REGRESSION — BUS-CREATE-INTENT-STATE-001 (adversarial-loop probe cycle 2026-11-05-0952; fixed 2026-11-05)
 * Scenario: payment intent created for a booking that does not need payment.
 * POST /api/payments/create-intent verified ownership only: it never read
 * the booking's status or payment_status, so an already-PAID booking got a
 * fresh PaymentIntent and its stored stripe_payment_intent_id — the field
 * POST /api/payments/refund refunds against — was overwritten with the new
 * unpaid intent; a CANCELLED booking likewise got an intent and a Stripe
 * call. The sibling routes state the contract this route omitted:
 * booking-checkout refuses 'paid' outright and CAS-claims only
 * 'unpaid'/'pending'; seamless does the same; the refund route treats
 * 'refunded' as terminal. The route now refuses (409, before any Stripe
 * call and before touching the stored intent id) when the booking is
 * terminal (status 'cancelled'/'completed') or the fee is settled or
 * claimed by another payment path (payment_status 'paid'/'refunded'/
 * 'processing'). 'failed' stays payable: it is the webhook's
 * payment_failed state and re-entering this route from the payment modal
 * is its designed retry.
 *
 * Invariant: a routing-fee payment intent may be created only for a live,
 * unpaid booking; an already-paid or cancelled booking must be refused
 * with no Stripe call and no change to its stored payment intent id.
 * Harness: in-memory mocked Supabase + mocked Stripe (loop probe pattern);
 * synthetic bookings only, no real charges.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { bookings: [] };
  const stripeCalls: any[] = [];
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    match(r: Row) { return this.filters.every(([k, v]) => r[k] === v); }
    exec() {
      const rows = store[this.table];
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
  stripe: { paymentIntents: { create: async (args: any) => { h.stripeCalls.push(args); return { id: 'pi_new_unpaid', client_secret: 'cs_new' }; } } },
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } }),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }));
vi.mock('@/lib/event-logger', () => ({ logEvent: async () => {} }));

import { POST } from '@/app/api/payments/create-intent/route';

function seed() {
  h.stripeCalls.length = 0;
  const base = {
    user_id: 'user-1', amount: 100, confirmation_code: 'CONF-1', routing_fee_amount: null,
    user: { email: 'rider@example.com', full_name: 'Rider' }, operator: { company_name: 'Op' },
  };
  h.store.bookings = [
    { ...base, id: 'bk-unpaid', status: 'confirmed', payment_status: 'unpaid', stripe_payment_intent_id: null },
    { ...base, id: 'bk-failed', status: 'confirmed', payment_status: 'failed', stripe_payment_intent_id: 'pi_failed_attempt' },
    { ...base, id: 'bk-paid', status: 'confirmed', payment_status: 'paid', stripe_payment_intent_id: 'pi_original_paid' },
    { ...base, id: 'bk-cancelled', status: 'cancelled', payment_status: 'unpaid', stripe_payment_intent_id: null },
    { ...base, id: 'bk-completed', status: 'completed', payment_status: 'unpaid', stripe_payment_intent_id: null },
    { ...base, id: 'bk-refunded', status: 'confirmed', payment_status: 'refunded', stripe_payment_intent_id: 'pi_refunded' },
    { ...base, id: 'bk-processing', status: 'confirmed', payment_status: 'processing', stripe_payment_intent_id: null },
  ];
}
async function createIntent(bookingId: string) {
  const req = new NextRequest('http://localhost/api/payments/create-intent', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bookingId }),
  });
  return POST(req);
}
const booking = (id: string) => h.store.bookings.find((b) => b.id === id)!;

describe('create-intent state gate (BUS-CREATE-INTENT-STATE-001)', () => {
  beforeEach(seed);
  it('control: intent for a live UNPAID booking succeeds, one Stripe call, intent stored', async () => {
    const res = await createIntent('bk-unpaid');
    expect(res.status).toBe(200);
    expect(h.stripeCalls.length).toBe(1);
    expect(booking('bk-unpaid').stripe_payment_intent_id).toBe('pi_new_unpaid');
  });
  it('control: intent for a FAILED booking succeeds (payment-modal retry after webhook payment_failed)', async () => {
    const res = await createIntent('bk-failed');
    expect(res.status).toBe(200);
    expect(h.stripeCalls.length).toBe(1);
    expect(booking('bk-failed').stripe_payment_intent_id).toBe('pi_new_unpaid');
  });
  it('attack: intent for an already-PAID booking is refused, no Stripe call, intent id unchanged', async () => {
    const res = await createIntent('bk-paid');
    expect(res.status).toBe(409);
    expect(h.stripeCalls.length).toBe(0);
    expect(booking('bk-paid').stripe_payment_intent_id).toBe('pi_original_paid');
  });
  it('attack: intent for a CANCELLED booking is refused, no Stripe call', async () => {
    const res = await createIntent('bk-cancelled');
    expect(res.status).toBe(409);
    expect(h.stripeCalls.length).toBe(0);
    expect(booking('bk-cancelled').stripe_payment_intent_id).toBeNull();
  });
  it('attack: intent for a COMPLETED booking is refused, no Stripe call', async () => {
    const res = await createIntent('bk-completed');
    expect(res.status).toBe(409);
    expect(h.stripeCalls.length).toBe(0);
    expect(booking('bk-completed').stripe_payment_intent_id).toBeNull();
  });
  it('attack: intent for a REFUNDED booking is refused, no Stripe call, intent id unchanged', async () => {
    const res = await createIntent('bk-refunded');
    expect(res.status).toBe(409);
    expect(h.stripeCalls.length).toBe(0);
    expect(booking('bk-refunded').stripe_payment_intent_id).toBe('pi_refunded');
  });
  it('attack: intent for a PROCESSING booking (claimed by another payment path) is refused, no Stripe call', async () => {
    const res = await createIntent('bk-processing');
    expect(res.status).toBe(409);
    expect(h.stripeCalls.length).toBe(0);
    expect(booking('bk-processing').stripe_payment_intent_id).toBeNull();
  });
});
