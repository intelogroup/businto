/**
 * PERMANENT REGRESSION — Phase 4 (M5), review field shapes.
 * Cards: BUS-REVIEW-RATING-SHAPE-001, BUS-REVIEW-RESPONSE-SHAPE-001.
 *
 * Invariants: a review rating is an integer NUMBER 1..5 — fractional,
 * string, and non-numeric shapes are refused 400 before any review row
 * or operator notification exists. An operator_response is a string
 * before it is stored — every other shape is refused 400 with no
 * write, while the genuine values succeed exactly as before.
 * Harness: in-memory mocked Supabase; synthetic booking/user only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { bookings: [], reviews: [], notifications: [], operator_profiles: [] };
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    match(r: Row) { return this.filters.every(([k, v]) => r[k] === v); }
    exec() {
      const rows = store[this.table] || (store[this.table] = []);
      if (this.op === 'insert') { const row = { id: `rev-${rows.length + 1}`, ...this.payload }; rows.push(row); return [row]; }
      if (this.op === 'update') { const m = rows.filter((r) => this.match(r)); m.forEach((r) => Object.assign(r, this.payload)); return m; }
      return rows.filter((r) => this.match(r));
    }
    async single() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }; }
    async maybeSingle() { const rows = this.exec(); return { data: rows.length ? rows[0] : null, error: null }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireUser: async () => ({ id: 'user-1', email: 'rider@example.com' }),
  requireAdmin: async () => null,
}));

import { POST, PATCH } from '@/app/api/reviews/route';

function reqFor(method: string, body: any) {
  return new NextRequest('http://localhost/api/reviews', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('review rating must be an integer 1..5 (BUS-REVIEW-RATING-SHAPE-001)', () => {
  beforeEach(() => {
    h.store.bookings = [{ id: 'bk-1', user_id: 'user-1', operator_id: 'op-1', status: 'completed' }];
    h.store.reviews = [];
    h.store.notifications = [];
  });
  it('control: integer rating 5 creates exactly one review + one notification', async () => {
    const res = await POST(reqFor('POST', { booking_id: 'bk-1', rating: 5, comment: 'great' }));
    expect(res.status).toBe(200);
    expect(h.store.reviews.length).toBe(1);
    expect(h.store.reviews[0].rating).toBe(5);
    expect(h.store.notifications.length).toBe(1);
  });
  it('control: out-of-range integer 6 is refused 400 with no review', async () => {
    const res = await POST(reqFor('POST', { booking_id: 'bk-1', rating: 6 }));
    expect(res.status).toBe(400);
    expect(h.store.reviews.length).toBe(0);
  });
  it('attack: fractional rating 4.5 is refused 400 and stores nothing', async () => {
    const res = await POST(reqFor('POST', { booking_id: 'bk-1', rating: 4.5 }));
    expect(res.status).toBe(400);
    expect(h.store.reviews.length).toBe(0);
    expect(h.store.notifications.length).toBe(0);
  });
  it('attack: string rating "5" is refused 400 and stores nothing', async () => {
    const res = await POST(reqFor('POST', { booking_id: 'bk-1', rating: '5' }));
    expect(res.status).toBe(400);
    expect(h.store.reviews.length).toBe(0);
    expect(h.store.notifications.length).toBe(0);
  });
  it('attack: non-numeric rating "abc" is refused 400 and stores nothing', async () => {
    const res = await POST(reqFor('POST', { booking_id: 'bk-1', rating: 'abc' }));
    expect(res.status).toBe(400);
    expect(h.store.reviews.length).toBe(0);
    expect(h.store.notifications.length).toBe(0);
  });
  it('attack: boolean rating true is refused 400 and stores nothing', async () => {
    const res = await POST(reqFor('POST', { booking_id: 'bk-1', rating: true }));
    expect(res.status).toBe(400);
    expect(h.store.reviews.length).toBe(0);
    expect(h.store.notifications.length).toBe(0);
  });
});

describe('review operator_response must be a string (BUS-REVIEW-RESPONSE-SHAPE-001)', () => {
  beforeEach(() => {
    h.store.reviews = [{ id: 'rev-1', operator_id: 'op-1', rating: 5, comment: 'great', operator_response: null }];
    h.store.operator_profiles = [{ id: 'user-1', operator_id: 'op-1' }];
  });
  it('control: string response succeeds and is stored verbatim', async () => {
    const res = await PATCH(reqFor('PATCH', { review_id: 'rev-1', operator_response: 'Thank you!' }));
    expect(res.status).toBe(200);
    expect(h.store.reviews[0].operator_response).toBe('Thank you!');
  });
  it('attack: numeric response 12345 is refused 400 and stores nothing', async () => {
    const res = await PATCH(reqFor('PATCH', { review_id: 'rev-1', operator_response: 12345 }));
    expect(res.status).toBe(400);
    expect(h.store.reviews[0].operator_response).toBeNull();
  });
  it('attack: boolean response true is refused 400 and stores nothing', async () => {
    const res = await PATCH(reqFor('PATCH', { review_id: 'rev-1', operator_response: true }));
    expect(res.status).toBe(400);
    expect(h.store.reviews[0].operator_response).toBeNull();
  });
  it('attack: array response is refused 400 and stores nothing', async () => {
    const res = await PATCH(reqFor('PATCH', { review_id: 'rev-1', operator_response: ['thanks'] }));
    expect(res.status).toBe(400);
    expect(h.store.reviews[0].operator_response).toBeNull();
  });
  it('attack: object response is refused 400 and stores nothing', async () => {
    const res = await PATCH(reqFor('PATCH', { review_id: 'rev-1', operator_response: { text: 'thanks' } }));
    expect(res.status).toBe(400);
    expect(h.store.reviews[0].operator_response).toBeNull();
  });
});
