/**
 * REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-06-2152; Phase 1 write core (src/lib/transitions.ts) — Businto
 * POST /api/payments/webhook, case payment_intent.payment_failed: updates
 * the booking by id unconditionally — payment_status='failed' — and never
 * reads the booking's current payment_status or status.
 * Real-world trigger: a rider's first routing-fee attempt fails; they retry
 * (the PaymentModal re-enters create-intent, which mints a NEW intent for
 * the same booking) and the retry succeeds — booking is 'paid'. Stripe
 * does not guarantee cross-event ordering, so the first attempt's
 * payment_failed event can be delivered AFTER the success. The verified
 * late event then regresses the paid booking to 'failed' and inserts a
 * 'Payment Failed — please try again' notification. A completed+paid
 * booking regressed to 'failed' also drops out of operator earnings
 * (earnings requires payment_status='paid').
 * Sibling of BUS-WEBHOOK-PI-SUCCEEDED-TERMINAL-001 (same handler, opposite
 * direction: late success overwriting terminal state) — this leg is the
 * late failure overwriting settled state.
 * Invariant: a booking whose payment has settled ('paid') cannot be
 * regressed to 'failed' by a late payment_failed event for a superseded
 * attempt; a genuinely unpaid booking does move to 'failed' (control).
 * Harness: in-memory mocked Supabase + mocked Stripe constructEvent.
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

function seed(status: string, payment_status: string) {
  h.store.bookings = [{
    id: 'book-1', user_id: 'user-1', operator_id: 'op-1', status, payment_status,
    confirmation_code: 'ABC123', amount: 100,
  }];
  h.store.webhook_events = [];
  h.store.notifications = [];
  h.setEvent({
    id: 'evt_1', type: 'payment_intent.payment_failed',
    data: { object: { id: 'pi_old_failed_attempt', metadata: { booking_id: 'book-1' } } },
  });
}
async function webhook() {
  const req = new NextRequest('http://localhost/api/payments/webhook', {
    method: 'POST', headers: { 'stripe-signature': 'sig_test' }, body: '{}',
  });
  return POST(req);
}

describe('payment_intent.payment_failed webhook on a settled booking', () => {
  it('control: live confirmed unpaid booking is marked failed', async () => {
    seed('confirmed', 'unpaid');
    const res = await webhook();
    expect(res.status).toBe(200);
    expect(h.store.bookings[0].payment_status).toBe('failed');
  });

  it('attack 1: PAID confirmed booking is not regressed to failed by the late event', async () => {
    seed('confirmed', 'paid');
    const res = await webhook();
    expect(res.status).toBe(200);
    expect(h.store.bookings[0].payment_status).toBe('paid');
    expect(h.store.notifications.filter((n: any) => n.type === 'payment_failed')).toHaveLength(0);
  });

  it('attack 2: COMPLETED paid booking is not regressed to failed by the late event', async () => {
    seed('completed', 'paid');
    const res = await webhook();
    expect(res.status).toBe(200);
    expect(h.store.bookings[0].payment_status).toBe('paid');
    expect(h.store.notifications.filter((n: any) => n.type === 'payment_failed')).toHaveLength(0);
  });
});
