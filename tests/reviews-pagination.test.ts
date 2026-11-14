/**
 * PERMANENT REGRESSION — BUS-REVIEWS-PAGINATION-001 (converted from the loop probe of cycle 2026-11-14-0352; assertions unchanged)
 * GET /api/reviews?operator_id=<id> is a public, unauthenticated list
 * endpoint with NO pagination: it never calls .range()/.limit() and
 * never reads page/limit, returning every review for the operator in
 * one response (and computing averageRating/totalReviews from that
 * full set, which part is correct). Sibling list endpoints paginate
 * with default 20 / max 50 (verified-fixed BUS-*-PAGINATION-001
 * family, incl. directory/bookings/quotes); this surface was not in
 * that family.
 * Invariant: a list response is bounded to at most 50 entries per
 * page, whatever the underlying volume; small volumes return
 * exactly with exact aggregates; an explicit ?limit=5 is honored.
 * Harness: in-memory mocked Supabase honoring range/limit if called.
 * Synthetic operator/reviews only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { reviews: [] };
  class QB {
    table: string; lo = 0; hi: number | null = null; lim: number | null = null;
    constructor(t: string) { this.table = t; }
    select() { return this; } eq() { return this; } order() { return this; }
    range(a: number, b: number) { this.lo = a; this.hi = b; return this; }
    limit(n: number) { this.lim = n; return this; }
    exec() {
      let rows = [...(store[this.table] || [])];
      if (this.hi !== null) rows = rows.slice(this.lo, this.hi + 1);
      if (this.lim !== null) rows = rows.slice(0, this.lim);
      return rows;
    }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB, user: null as any };
});
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireUser: async () => h.user,
}));
import { GET } from '@/app/api/reviews/route';
function seed(n: number) {
  h.store.reviews = Array.from({ length: n }, (_, i) => ({
    id: `rev-${i + 1}`, rating: 5, comment: `c${i + 1}`, operator_response: null,
    operator_response_at: null, created_at: '2026-11-01T00:00:00Z',
    user: { id: `u-${i + 1}`, full_name: `Rider ${i + 1}`, avatar_url: null },
  }));
}
const req = (qs = '') => new NextRequest(`http://localhost/api/reviews${qs}`);
describe('operator reviews list must be bounded like sibling lists, aggregates exact', () => {
  beforeEach(() => seed(0));
  it('control: no filter is refused 400', async () => {
    const r = await GET(req()); expect(r.status).toBe(400);
  });
  it('control: small volume (2 reviews) returns exactly 2, totalReviews 2, avg 5', async () => {
    seed(2); const r = await GET(req('?operator_id=op-1')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.reviews).toHaveLength(2); expect(b.totalReviews).toBe(2); expect(b.averageRating).toBe(5);
  });
  it('attack: 60 reviews return at most 50 in one response', async () => {
    seed(60); const r = await GET(req('?operator_id=op-1')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.reviews.length).toBeLessThanOrEqual(50);
  });
  it('attack: explicit ?limit=5&page=1 is honored (at most 5 reviews)', async () => {
    seed(60); const r = await GET(req('?operator_id=op-1&limit=5&page=1')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.reviews.length).toBeLessThanOrEqual(5);
  });
});
