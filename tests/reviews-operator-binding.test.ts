/**
 * Permanent regression — BUS-REVIEW-OPERATOR-001.
 * POST /api/reviews: the review's operator is derived server-side from the
 * booking (bookings.operator_id); a body-supplied operator_id is never
 * trusted. Adapted from the loop probe of cycle 2026-11-03-0052 (preserved
 * in the loop evidence), with added derivation legs.
 * Harness: in-memory mocked Supabase; synthetic operators only.
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

function seed(bookingOperator: string | null = 'op-real') {
  // status added 2026-11-05: POST /api/reviews now refuses non-completed
  // bookings (BUS-REVIEW-CANCELLED-001); a booking under review here is a
  // completed one. Real booking rows always carry a status.
  h.store.bookings = [{ id: 'bk-1', user_id: 'user-1', operator_id: bookingOperator, status: 'completed' }];
  h.store.reviews = [];
  h.store.notifications = [];
}
async function review(body: Record<string, any>) {
  const req = new NextRequest('http://localhost/api/reviews', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ booking_id: 'bk-1', rating: 1, comment: 'probe', ...body }),
  });
  return POST(req);
}

describe('reviews operator binding (BUS-REVIEW-OPERATOR-001)', () => {
  beforeEach(() => seed());
  it('control: review naming the booking actual operator succeeds', async () => {
    const res = await review({ operator_id: 'op-real' });
    expect(res.status).toBe(200);
    expect(h.store.reviews.length).toBe(1);
    expect(h.store.reviews[0].operator_id).toBe('op-real');
    expect(h.store.notifications[0].user_id).toBe('op-real');
  });
  it('attack: review naming an arbitrary operator is refused, nothing stored or notified', async () => {
    const res = await review({ operator_id: 'op-victim' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.store.reviews.filter((r) => r.operator_id === 'op-victim').length).toBe(0);
    expect(h.store.reviews.length).toBe(0);
    expect(h.store.notifications.filter((n) => n.user_id === 'op-victim').length).toBe(0);
  });
  it('operator_id omitted from the body is derived from the booking', async () => {
    const res = await review({});
    expect(res.status).toBe(200);
    expect(h.store.reviews.length).toBe(1);
    expect(h.store.reviews[0].operator_id).toBe('op-real');
  });
  it('a booking with no operator cannot be reviewed', async () => {
    seed(null);
    const res = await review({ operator_id: 'op-victim' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.store.reviews.length).toBe(0);
    expect(h.store.notifications.length).toBe(0);
  });
});
