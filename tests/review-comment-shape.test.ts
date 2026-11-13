/**
 * PERMANENT REGRESSION — BUS-REVIEW-COMMENT-SHAPE-001 (converted from the loop probe of cycle 2026-11-12-1852; assertions unchanged)
 * POST /api/reviews (src/app/api/reviews/route.ts) parses rating via
 * parseRating (BUS-REVIEW-RATING-SHAPE-001) and PATCH parses
 * operator_response via parseTextField (BUS-REVIEW-RESPONSE-SHAPE-001),
 * but the POST comment field is destructured and inserted verbatim
 * (line ~101) with no typeof check. Non-string shapes (number, boolean,
 * array, object) are persisted as the rider's public review comment,
 * which GET /api/reviews exposes on the operator profile.
 * Invariant: comment, when present, must be a string; any other shape
 * is refused 400 before any review row or operator notification is
 * created, while a genuine string comment (and an omitted comment)
 * succeeds exactly once.
 * Harness: in-memory mocked Supabase; synthetic booking/user only.
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

import { POST } from '@/app/api/reviews/route';

function seed() {
  h.store.bookings = [{ id: 'bk-1', user_id: 'user-1', operator_id: 'op-1', status: 'completed' }];
  h.store.reviews = [];
  h.store.notifications = [];
}
function reqFor(body: any) {
  return new NextRequest('http://localhost/api/reviews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('review comment must be a string when present', () => {
  beforeEach(seed);
  it('control: string comment creates exactly one review + one notification, stored verbatim', async () => {
    const res = await POST(reqFor({ booking_id: 'bk-1', rating: 5, comment: 'great ride' }));
    expect(res.status).toBe(200);
    expect(h.store.reviews.length).toBe(1);
    expect(h.store.reviews[0].comment).toBe('great ride');
    expect(h.store.notifications.length).toBe(1);
  });
  it('control: omitted comment succeeds with no comment stored', async () => {
    const res = await POST(reqFor({ booking_id: 'bk-1', rating: 5 }));
    expect(res.status).toBe(200);
    expect(h.store.reviews.length).toBe(1);
    expect(h.store.reviews[0].comment).toBeUndefined();
  });
  it('attack: numeric comment 12345 is refused 400 and stores nothing', async () => {
    const res = await POST(reqFor({ booking_id: 'bk-1', rating: 5, comment: 12345 }));
    expect(res.status).toBe(400);
    expect(h.store.reviews.length).toBe(0);
    expect(h.store.notifications.length).toBe(0);
  });
  it('attack: boolean comment true is refused 400 and stores nothing', async () => {
    const res = await POST(reqFor({ booking_id: 'bk-1', rating: 5, comment: true }));
    expect(res.status).toBe(400);
    expect(h.store.reviews.length).toBe(0);
    expect(h.store.notifications.length).toBe(0);
  });
  it('attack: array comment is refused 400 and stores nothing', async () => {
    const res = await POST(reqFor({ booking_id: 'bk-1', rating: 5, comment: ['great'] }));
    expect(res.status).toBe(400);
    expect(h.store.reviews.length).toBe(0);
    expect(h.store.notifications.length).toBe(0);
  });
  it('attack: object comment is refused 400 and stores nothing', async () => {
    const res = await POST(reqFor({ booking_id: 'bk-1', rating: 5, comment: { text: 'great' } }));
    expect(res.status).toBe(400);
    expect(h.store.reviews.length).toBe(0);
    expect(h.store.notifications.length).toBe(0);
  });
});
