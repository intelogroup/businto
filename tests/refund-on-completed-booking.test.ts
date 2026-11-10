/**
 * REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-06-0952; Phase 1 write core (src/lib/transitions.ts) — Businto
 * POST /api/payments/refund gates on payment_status, quote status, and the
 * 48-hour age rule (BUS-REFUND-GATE-001), but never reads booking.status.
 * A completed booking (trip already taken) that is paid, >48h old, and has
 * an accepted quote passes every gate and receives a Stripe refund.
 * Invariant (PROJECT_SCOPES): booking status moves only along legal
 * transitions — no cancelling a completed trip into a refund. A refund for
 * a terminal completed booking must be refused with no Stripe call and no
 * payment_status change, while a live confirmed booking past 48h with a
 * pending quote still refunds (control).
 * Harness: in-memory mocked Supabase + mocked Stripe (refund-eligibility pattern).
 */
import { describe, it, expect, vi } from 'vitest';
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

vi.mock('@/lib/supabase/admin', () => ({
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

function seed(status: string, quoteStatus = 'accepted', ageHours = 72) {
  h.stripeCalls.length = 0;
  const createdAt = new Date(Date.now() - ageHours * 3600 * 1000).toISOString();
  h.store.bookings = [{
    id: 'bk-1', user_id: 'user-1', status, payment_status: 'paid', stripe_payment_intent_id: 'pi_test_1',
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

describe('refund on a completed booking (terminal-state guard)', () => {
  it('control: live confirmed booking past 48h with a pending quote refunds', async () => {
    seed('confirmed', 'pending');
    const res = await refund('Changed my mind');
    expect(res.status).toBe(200);
    expect(h.stripeCalls.length).toBe(1);
    expect(h.store.bookings[0].payment_status).toBe('refunded');
  });

  it('attack 1: COMPLETED booking (accepted quote, 72h old) is refused, no Stripe call', async () => {
    seed('completed', 'accepted');
    const res = await refund('Changed my mind');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.stripeCalls.length).toBe(0);
    expect(h.store.bookings[0].payment_status).toBe('paid');
  });

  it('attack 2: COMPLETED booking with the canonical auto-refund reason is refused, no Stripe call', async () => {
    seed('completed', 'accepted');
    const res = await refund('No operator response');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.stripeCalls.length).toBe(0);
    expect(h.store.bookings[0].payment_status).toBe('paid');
  });
});
