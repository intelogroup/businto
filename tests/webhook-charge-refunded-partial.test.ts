/**
 * REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-07-0052; Phase 1 write core (src/lib/transitions.ts) — Businto
 * POST /api/payments/webhook, case charge.refunded: looks the booking up
 * by stripe_payment_intent_id and updates payment_status='refunded'
 * unconditionally, never reading the Charge's amount / amount_refunded /
 * refunded fields. Stripe sends charge.refunded for partial refunds too;
 * the Charge object distinguishes them (refunded=false,
 * amount_refunded < amount).
 * Real-world trigger: a platform admin issues a PARTIAL goodwill refund in
 * the Stripe dashboard (e.g. $25 of a $100 charge after a late pickup).
 * The webhook then marks the whole booking 'refunded' and tells the rider
 * "Your payment ... has been refunded." Consequences in-repo:
 *  - create-intent treats 'refunded' as terminal (409, BUS-CREATE-INTENT
 *    guard comment: refund route treats 'refunded' as the fee's terminal
 *    state) — the booking can never be re-paid / topped up;
 *  - the refund route refuses payment_status==='refunded' bookings, so the
 *    remaining $75 can never be refunded through the platform;
 *  - operator earnings keyed on payment_status='paid' lose the booking
 *    even though $75 was kept.
 * Invariant: only a FULL refund (charge.refunded=true /
 * amount_refunded >= amount) may move a booking to the terminal
 * payment_status='refunded'; a partial refund leaves a paid booking paid
 * (control: full refund does transition + notify).
 * Harness: in-memory mocked Supabase + mocked Stripe constructEvent,
 * same pattern as the sibling webhook probes.
 */
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { bookings: [], webhook_events: [], notifications: [] };
  let event: any = null;
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; if (!store[this.table]) store[this.table] = []; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
    match(r: Row) { return this.filters.every(([k, v]) => r[k] === v); }
    exec() {
      const rows = store[this.table];
      if (this.op === 'update') { const m = rows.filter((r) => this.match(r)); m.forEach((r) => Object.assign(r, this.payload)); return m; }
      if (this.op === 'insert') { rows.push(this.payload); return [this.payload]; }
      return rows.filter((r) => this.match(r));
    }
    async single() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB, setEvent: (e: any) => { event = e; }, getEvent: () => event };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
}));
vi.mock('@/lib/stripe', () => ({
  stripe: { webhooks: { constructEvent: () => h.getEvent() } },
}));
vi.mock('@/lib/event-logger', () => ({ logEvent: async () => {} }));

import { POST } from '@/app/api/payments/webhook/route';

function seed(status: string, amountRefunded: number, refundedFlag: boolean) {
  h.store.bookings = [{
    id: 'book-1', user_id: 'user-1', operator_id: 'op-1', status, payment_status: 'paid',
    confirmation_code: 'ABC123', amount: 100, stripe_payment_intent_id: 'pi_1',
  }];
  h.store.webhook_events = [];
  h.store.notifications = [];
  h.setEvent({
    id: 'evt_1', type: 'charge.refunded',
    data: { object: { id: 'ch_1', payment_intent: 'pi_1', amount: 10000, amount_refunded: amountRefunded, refunded: refundedFlag } },
  });
}
async function webhook() {
  const req = new NextRequest('http://localhost/api/payments/webhook', {
    method: 'POST', headers: { 'stripe-signature': 'sig_test' }, body: '{}',
  });
  return POST(req);
}

describe('charge.refunded webhook: partial vs full refund', () => {
  it('control: FULL refund moves a paid booking to refunded', async () => {
    seed('confirmed', 10000, true);
    const res = await webhook();
    expect(res.status).toBe(200);
    expect(h.store.bookings[0].payment_status).toBe('refunded');
  });

  it('attack 1: PARTIAL refund ($25 of $100) does not mark a confirmed paid booking refunded', async () => {
    seed('confirmed', 2500, false);
    const res = await webhook();
    expect(res.status).toBe(200);
    expect(h.store.bookings[0].payment_status).toBe('paid');
    expect(h.store.notifications.filter((n: any) => n.type === 'payment_refunded')).toHaveLength(0);
  });

  it('attack 2: PARTIAL refund does not mark a COMPLETED paid booking refunded', async () => {
    seed('completed', 2500, false);
    const res = await webhook();
    expect(res.status).toBe(200);
    expect(h.store.bookings[0].payment_status).toBe('paid');
    expect(h.store.notifications.filter((n: any) => n.type === 'payment_refunded')).toHaveLength(0);
  });
});
