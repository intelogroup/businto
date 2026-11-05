/**
 * PERMANENT REGRESSION — BUS-REVIEW-CANCELLED-001 (adversarial-loop probe cycle 2026-11-05-0652; fixed 2026-11-05)
 * Scenario: review on a CANCELLED booking.
 * POST /api/reviews verified ownership and (since BUS-REVIEW-OPERATOR-001)
 * derived the operator from the booking, but selected only id+operator_id
 * and never read the booking's status. The repo's own UI rule
 * (tests/review-ui.test.ts) is explicit: cancelled trips do NOT show the
 * review section. The route now selects the booking status and refuses
 * any non-completed booking before the insert.
 *
 * Invariant: a review may be created only for a booking that actually
 * ran (completed); a cancelled booking must be refused with no review
 * row and no operator notification.
 * Harness: in-memory mocked Supabase (repo reviews probe pattern);
 * synthetic operator only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { bookings: [], reviews: [], notifications: [] };
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
    match(r: Row) { return this.filters.every(([k, v]) => r[k] === v); }
    exec() {
      const rows = store[this.table];
      if (this.op === 'insert') { const row = { id: `row-${rows.length + 1}`, ...this.payload }; rows.push(row); return [row]; }
      return rows.filter((r) => this.match(r));
    }
    async single() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireUser: async () => ({ id: 'user-1' }),
}));

import { POST } from '@/app/api/reviews/route';

function seed() {
  h.store.bookings = [
    { id: 'bk-done', user_id: 'user-1', operator_id: 'op-real', status: 'completed' },
    { id: 'bk-cancelled', user_id: 'user-1', operator_id: 'op-real', status: 'cancelled' },
  ];
  h.store.reviews = [];
  h.store.notifications = [];
}
async function review(booking_id: string) {
  const req = new NextRequest('http://localhost/api/reviews', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ booking_id, operator_id: 'op-real', rating: 1, comment: 'probe' }),
  });
  return POST(req);
}

describe('review on cancelled booking (regression)', () => {
  beforeEach(seed);
  it('control: review on COMPLETED booking succeeds, stored for the real operator', async () => {
    const res = await review('bk-done');
    expect(res.status).toBe(200);
    expect(h.store.reviews.length).toBe(1);
    expect(h.store.reviews[0].operator_id).toBe('op-real');
  });
  it('attack: review on CANCELLED booking is refused, no review, no notification', async () => {
    const res = await review('bk-cancelled');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.store.reviews.length).toBe(0);
    expect(h.store.notifications.length).toBe(0);
  });
});
