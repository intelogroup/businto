/**
 * REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-06-1252; Phase 1 write core (src/lib/transitions.ts) — Businto
 * POST /api/payments/webhook, case checkout.session.completed with
 * metadata.type='priority_fee': updates the transport request by id
 * unconditionally — payment_status='paid', a fresh 30-min priority_until,
 * routing_fee_amount=1.99. It never reads the request's status. A rider
 * can start priority checkout while a request is open, cancel the
 * request, and still complete payment afterwards; the late webhook then
 * marks the CANCELLED request paid and priority-active.
 * Invariant (PROJECT_SCOPES): booking/request status moves only along
 * legal transitions; a closed request cannot gain paid/priority state.
 * Expected: a cancelled/completed request is left untouched by the
 * webhook, while an open pending request is marked paid+priority
 * (control).
 * Harness: in-memory mocked Supabase + mocked Stripe constructEvent.
 */
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { transport_requests: [], webhook_events: [] };
  let event: any = null;
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
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

function seed(status: string) {
  h.store.transport_requests = [{
    id: 'req-1', user_id: 'user-1', status, payment_status: 'unpaid', priority_until: null,
  }];
  h.store.webhook_events = [];
  h.setEvent({
    id: 'evt_1', type: 'checkout.session.completed',
    data: { object: { metadata: { type: 'priority_fee', request_id: 'req-1' }, payment_intent: 'pi_test_1' } },
  });
}
async function webhook() {
  const req = new NextRequest('http://localhost/api/payments/webhook', {
    method: 'POST', headers: { 'stripe-signature': 'sig_test' }, body: '{}',
  });
  return POST(req);
}

describe('priority-fee webhook on a closed transport request', () => {
  it('control: open pending request is marked paid with a priority window', async () => {
    seed('pending');
    const res = await webhook();
    expect(res.status).toBe(200);
    expect(h.store.transport_requests[0].payment_status).toBe('paid');
    expect(h.store.transport_requests[0].priority_until).not.toBeNull();
  });

  it('attack 1: CANCELLED request gains no paid/priority state from the late webhook', async () => {
    seed('cancelled');
    const res = await webhook();
    expect(res.status).toBe(200);
    expect(h.store.transport_requests[0].payment_status).toBe('unpaid');
    expect(h.store.transport_requests[0].priority_until).toBeNull();
  });

  it('attack 2: COMPLETED request gains no paid/priority state from the late webhook', async () => {
    seed('completed');
    const res = await webhook();
    expect(res.status).toBe(200);
    expect(h.store.transport_requests[0].payment_status).toBe('unpaid');
    expect(h.store.transport_requests[0].priority_until).toBeNull();
  });
});
