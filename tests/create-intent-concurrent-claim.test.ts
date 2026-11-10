/**
 * REGRESSION TEST — written for the Phase 2 build lane, 2026-11-10 (M3) — Businto
 * Scenario (residual of VERIFIED-FIXED BUS-CREATE-INTENT-STATE-001):
 * POST /api/payments/create-intent's state gate is a read-then-refuse
 * check: it reads the booking, refuses settled/terminal states, then
 * creates a Stripe PaymentIntent and stores its id with an
 * unpredicated update. Two CONCURRENT calls for the same unpaid
 * booking both pass the gate on the same read, both mint a Stripe
 * intent, and the second store overwrites the first — the booking
 * ends up pointing at one intent while two live intents exist (the
 * stored id is the field the refund route refunds against).
 *
 * Invariant: exactly one Stripe PaymentIntent is minted per booking
 * payment claim; a concurrent second call is refused (409) or served
 * the claimed intent — never a second intent.
 * Harness: in-memory mocked Supabase (eq CAS support — claim exec is
 * synchronous at await points, so the Promise.all interleaving is
 * deterministic) + mocked Stripe counting intent creations.
 * Synthetic bookings only, no real charges.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { bookings: [] };
  const stripeCalls: any[] = [];
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
    paymentIntents: {
      create: async (args: any) => {
        h.stripeCalls.push(args);
        const n = h.stripeCalls.length;
        return { id: `pi_minted_${n}`, client_secret: `cs_${n}` };
      },
    },
  },
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

describe('create-intent concurrency: two simultaneous calls mint exactly one intent', () => {
  beforeEach(seed);
  it('control: a single call mints one intent and stores it', async () => {
    const res = await createIntent('bk-unpaid');
    expect(res.status).toBe(200);
    expect(h.stripeCalls.length).toBe(1);
    expect(booking('bk-unpaid').stripe_payment_intent_id).toBe('pi_minted_1');
  });
  it('attack: two concurrent calls for the same unpaid booking mint exactly ONE intent', async () => {
    const [r1, r2] = await Promise.all([createIntent('bk-unpaid'), createIntent('bk-unpaid')]);
    const statuses = [r1.status, r2.status].sort();
    // Exactly one Stripe intent exists, no matter which call won.
    expect(h.stripeCalls.length).toBe(1);
    // Exactly one success; the loser is refused with the gate's 409.
    expect(statuses).toEqual([200, 409]);
    // The stored intent id is the single minted intent.
    expect(booking('bk-unpaid').stripe_payment_intent_id).toBe('pi_minted_1');
    // The booking is left in its original payable state (the claim is
    // released by the commit), so the modal/webhook flow is unchanged.
    expect(booking('bk-unpaid').payment_status).toBe('unpaid');
  });
});
