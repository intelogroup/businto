/**
 * Permanent regression — BUS-REFUND-GATE-001.
 * POST /api/payments/refund: refund eligibility is server-decided from the
 * booking's state and age. The client-supplied `reason` is a label only and
 * must never bypass the 48-hour gate. Adapted from the loop probe of
 * cycle 2026-11-02-2152 (preserved in the loop evidence), with an added
 * legitimate-flow leg: a booking past 48h still refunds.
 * Harness: in-memory mocked supabaseAdmin + mocked Stripe; no real charges.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { bookings: [], profiles: [], notifications: [] };
  const stripeCalls: any[] = [];
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
  return { store, QB, stripeCalls };
});

vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
}));
vi.mock('@/lib/stripe', () => ({
  stripe: { refunds: { create: async (args: any, opts: any) => { h.stripeCalls.push({ args, opts }); return { id: 're_test_1', amount: 199, status: 'succeeded' }; } } },
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } }),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }));
vi.mock('@/lib/event-logger', () => ({ logEvent: async () => {} }));

import { POST } from '@/app/api/payments/refund/route';

function seed(ageHours: number, quoteStatus = 'accepted') {
  h.stripeCalls.length = 0;
  const createdAt = new Date(Date.now() - ageHours * 3600 * 1000).toISOString();
  h.store.bookings = [{
    id: 'bk-1', user_id: 'user-1', payment_status: 'paid', stripe_payment_intent_id: 'pi_test_1',
    created_at: createdAt, routing_fee_amount: 1.99,
    quotes: [{ id: 'q-1', status: quoteStatus, created_at: createdAt }],
  }];
  h.store.profiles = [{ id: 'user-1' }];
  h.store.notifications = [];
}
async function refund(reason: string) {
  const req = new NextRequest('http://localhost/api/payments/refund', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bookingId: 'bk-1', reason }),
  });
  return POST(req);
}

describe('refund eligibility is server-decided (BUS-REFUND-GATE-001)', () => {
  it('exact no-response reason within 48h is refused, no Stripe call', async () => {
    seed(1);
    const res = await refund('No operator response');
    expect(res.status).toBe(400);
    expect(h.stripeCalls.length).toBe(0);
    expect(h.store.bookings[0].payment_status).toBe('paid');
  });
  it('arbitrary reason cannot bypass the 48h gate on an accepted, 1h-old booking', async () => {
    seed(1);
    const res = await refund('Changed my mind');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.stripeCalls.length).toBe(0);
    expect(h.store.bookings[0].payment_status).toBe('paid');
  });
  it('lowercase variant of the gated reason cannot bypass the gate', async () => {
    seed(1);
    const res = await refund('no operator response');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.stripeCalls.length).toBe(0);
    expect(h.store.bookings[0].payment_status).toBe('paid');
  });
  it('legitimate flow: booking past 48h with a pending quote refunds, whatever the label', async () => {
    seed(72, 'pending');
    const res = await refund('Changed my mind');
    expect(res.status).toBe(200);
    expect(h.stripeCalls.length).toBe(1);
    expect(h.store.bookings[0].payment_status).toBe('refunded');
  });
  it('booking whose quotes are all declined stays ineligible even past 48h', async () => {
    seed(72, 'declined');
    const res = await refund('No operator response');
    expect(res.status).toBe(400);
    expect(h.stripeCalls.length).toBe(0);
    expect(h.store.bookings[0].payment_status).toBe('paid');
  });
});
