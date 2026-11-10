/**
 * REGRESSION TEST — BUS-WEBHOOK-DEDUPE-SWALLOW-001; Phase 2 payment
 * discipline (M3) — Businto. Harness and control promoted from loop
 * probe, cycle 2026-11-09-0352; the attack is written to the design
 * the card, the fix vision (M3), and the cycle's own invariant adopt:
 * "if its dedupe record cannot be written, the event must not be
 * applied unrecorded (the delivery should fail so Stripe retries
 * after the record path recovers)".
 *
 * NOTE on the preserved probe: its attack assertions encode the OTHER
 * branch named in its comment (apply exactly once with in-band
 * dedupe — 200/200 with exactly 2 notifications). The adopted design
 * takes the fail-closed branch instead, so against the verbatim probe
 * the attack now fails at its status assertion with the CORRECT
 * behavior (500, event unapplied). See the Phase 2 run record
 * (hidden_files/runs/2026-11-10-phase2/businto/RUN.md) for the full
 * pre/post evidence.
 *
 * Contract under test:
 * - control: a recorded delivery applies once (booking paid, 2
 *   notifications); a redelivery is a deduped no-op (duplicate:true).
 * - transient record-insert failure: the delivery is refused with a
 *   retryable 500 and the event is NOT applied — no state change, no
 *   notifications — on every delivery while the record path is down.
 * - unique violation on the record insert (a concurrent delivery
 *   recorded the event first): the delivery answers duplicate:true
 *   and does not apply the event.
 * Harness: in-memory mocked Supabase + mocked Stripe constructEvent,
 * following the repo's webhook probe pattern. Synthetic data only.
 */
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { bookings: [], webhook_events: [], notifications: [] };
  let insertFailure: 'none' | 'transient' | 'unique' = 'none';
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
      if (this.op === 'update') { const m = rows.filter((r) => this.match(r)); m.forEach((r) => Object.assign(r, this.payload)); return { data: m, error: null }; }
      if (this.op === 'insert') {
        if (this.table === 'webhook_events' && insertFailure === 'transient') {
          return { data: null, error: { message: 'transient insert failure (simulated)' } };
        }
        if (this.table === 'webhook_events' && insertFailure === 'unique') {
          return { data: null, error: { message: 'duplicate key value violates unique constraint "webhook_events_stripe_event_id_key"', code: '23505' } };
        }
        rows.push(this.payload); return { data: [this.payload], error: null };
      }
      return { data: rows.filter((r) => this.match(r)), error: null };
    }
    async single() {
      const r = this.exec();
      if (r.error) return { data: null, error: r.error };
      const rows = r.data as Row[];
      return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } };
    }
    then(res: any, rej: any) { try { res(this.exec()); } catch (e) { rej(e); } }
  }
  return {
    store, QB,
    setInsertFailure: (v: 'none' | 'transient' | 'unique') => { insertFailure = v; },
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
}));
vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: () => ({
        id: 'evt_dup_1', type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test_1', metadata: { booking_id: 'book-1' } } },
      }),
    },
  },
}));
vi.mock('@/lib/event-logger', () => ({ logEvent: async () => {} }));

import { POST } from '@/app/api/payments/webhook/route';

function seed(failure: 'none' | 'transient' | 'unique') {
  h.store.bookings = [{
    id: 'book-1', user_id: 'user-1', operator_id: 'op-1', status: 'confirmed',
    payment_status: 'unpaid', confirmation_code: 'ABC123', amount: 100,
  }];
  h.store.webhook_events = [];
  h.store.notifications = [];
  h.setInsertFailure(failure);
}
async function webhook() {
  const req = new NextRequest('http://localhost/api/payments/webhook', {
    method: 'POST', headers: { 'stripe-signature': 'sig_test' }, body: '{}',
  });
  return POST(req);
}

describe('webhook dedupe: an unrecorded event must not be applied (fail closed)', () => {
  it('control: recorded delivery applies once; redelivery is a deduped no-op', async () => {
    seed('none');
    const r1 = await webhook();
    expect(r1.status).toBe(200);
    expect(h.store.bookings[0].payment_status).toBe('paid');
    expect(h.store.notifications.length).toBe(2);
    const r2 = await webhook();
    expect(r2.status).toBe(200);
    const body2 = await r2.json();
    expect(body2.duplicate).toBe(true);
    expect(h.store.notifications.length).toBe(2);
  });

  it('attack: when the dedupe record insert fails transiently, deliveries fail closed and never apply', async () => {
    seed('transient');
    const r1 = await webhook();
    expect(r1.status).toBe(500);
    expect(h.store.bookings[0].payment_status).toBe('unpaid');
    expect(h.store.notifications.length).toBe(0);
    expect(h.store.webhook_events.length).toBe(0);
    // Stripe redelivers while the record path is still down: same
    // fail-closed answer, still nothing applied — never a double
    // application, and once the record path recovers the retry is
    // recorded and applied exactly once (the control above).
    const r2 = await webhook();
    expect(r2.status).toBe(500);
    expect(h.store.bookings[0].payment_status).toBe('unpaid');
    expect(h.store.notifications.length).toBe(0);
  });

  it('unique violation on the record insert is a duplicate, not an application', async () => {
    seed('unique');
    const r1 = await webhook();
    expect(r1.status).toBe(200);
    const body1 = await r1.json();
    expect(body1.duplicate).toBe(true);
    expect(h.store.bookings[0].payment_status).toBe('unpaid');
    expect(h.store.notifications.length).toBe(0);
  });
});
