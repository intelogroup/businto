/**
 * REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-06-1552; Phase 1 write core (src/lib/transitions.ts) — Businto
 * POST /api/payments/webhook, case payment_intent.succeeded: updates the
 * booking by id unconditionally — payment_status='paid' — and never reads
 * the booking's status. A PaymentIntent created while a booking was live
 * can succeed late (delayed bank confirmation / user completes a bank-app
 * approval after cancelling); the verified webhook then marks the
 * CANCELLED booking paid, inserts payment_success/payment_received
 * notifications, and enters the PII-reveal email block.
 * Sibling of BUS-WEBHOOK-PRIORITY-CLOSED-001 (same handler, priority_fee
 * leg on transport_requests) — this leg is bookings.
 * Invariant (PROJECT_SCOPES): booking status/payment state moves only
 * along legal transitions; a terminal (cancelled/completed) booking
 * cannot gain paid state from a late webhook.
 * Expected: a cancelled/completed booking is left untouched, while a
 * live confirmed booking is marked paid (control).
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
    id: 'evt_1', type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_test_1', metadata: { booking_id: 'book-1' } } },
  });
}
async function webhook() {
  const req = new NextRequest('http://localhost/api/payments/webhook', {
    method: 'POST', headers: { 'stripe-signature': 'sig_test' }, body: '{}',
  });
  return POST(req);
}

describe('payment_intent.succeeded webhook on a terminal booking', () => {
  it('control: live confirmed unpaid booking is marked paid', async () => {
    seed('confirmed', 'unpaid');
    const res = await webhook();
    expect(res.status).toBe(200);
    expect(h.store.bookings[0].payment_status).toBe('paid');
  });

  it('attack 1: CANCELLED booking gains no paid state from the late webhook', async () => {
    seed('cancelled', 'unpaid');
    const res = await webhook();
    expect(res.status).toBe(200);
    expect(h.store.bookings[0].payment_status).toBe('unpaid');
  });

  it('attack 2: COMPLETED booking gains no paid state from the late webhook', async () => {
    seed('completed', 'unpaid');
    const res = await webhook();
    expect(res.status).toBe(200);
    expect(h.store.bookings[0].payment_status).toBe('unpaid');
  });
});
