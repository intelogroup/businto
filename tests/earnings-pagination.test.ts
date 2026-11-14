/**
 * PERMANENT REGRESSION — BUS-EARNINGS-PAGINATION-001 (converted from the loop probe of cycle 2026-11-13-2152; assertions unchanged)
 * GET /api/operator/earnings fetches ALL completed/paid bookings for the
 * operator with no .range()/.limit() and returns every trip in one
 * unbounded response. Sibling list endpoints paginate with default 20 /
 * max 50 (verified-fixed BUS-*-PAGINATION-001 family); this surface was
 * deferred in cycle 2026-11-13-1852 and is now selected.
 * Invariant: a list response is bounded to at most 50 entries per page,
 * whatever the underlying volume, while aggregate totals (allTimeTotal,
 * totalTrips, monthlySummary) still reflect ALL bookings; small volumes
 * return exactly.
 * Harness: in-memory mocked Supabase (supabase-server) honoring
 * range/limit if called. Synthetic operator/bookings only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { bookings: [] };
  class QB {
    table: string; lo = 0; hi: number | null = null; lim: number | null = null;
    constructor(t: string) { this.table = t; }
    select() { return this; } eq() { return this; } order() { return this; }
    range(a: number, b: number) { this.lo = a; this.hi = b; return this; }
    limit(n: number) { this.lim = n; return this; }
    async maybeSingle() {
      if (this.table === 'operator_profiles') return { data: { operator_id: 'op-1' }, error: null };
      return { data: null, error: null };
    }
    exec() {
      let rows = [...(store[this.table] || [])];
      if (this.hi !== null) rows = rows.slice(this.lo, this.hi + 1);
      if (this.lim !== null) rows = rows.slice(0, this.lim);
      return rows;
    }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB, user: { id: 'op-user-1' } as any };
});
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireUser: async () => h.user,
}));
import { GET } from '@/app/api/operator/earnings/route';
function seed(n: number) {
  h.user = { id: 'op-user-1' };
  h.store.bookings = Array.from({ length: n }, (_, i) => ({
    id: `b-${i + 1}`, confirmation_code: `C${i + 1}`, status: 'completed', payment_status: 'paid',
    amount: 100, created_at: '2026-11-01T00:00:00Z',
    request: { id: `r-${i + 1}`, service_type: 'school', pickup_fuzzy: 'Everett', dropoff_fuzzy: 'Boston', start_date: '2026-11-10', start_time: '08:00' },
  }));
}
const req = (qs = '') => new NextRequest(`http://localhost/api/operator/earnings${qs}`);
describe('operator earnings trips list must be bounded like sibling lists, totals exact', () => {
  beforeEach(() => seed(0));
  it('control: unauthenticated is refused 401', async () => { h.user = null; const r = await GET(req()); expect(r.status).toBe(401); });
  it('control: small volume (2 trips) returns exactly 2 and totals 200/2', async () => {
    seed(2); const r = await GET(req()); expect(r.status).toBe(200); const b = await r.json();
    expect(b.trips).toHaveLength(2); expect(b.allTimeTotal).toBe(200); expect(b.totalTrips).toBe(2);
  });
  it('attack: 60 trips return at most 50 in one response, totals still 6000/60', async () => {
    seed(60); const r = await GET(req()); expect(r.status).toBe(200); const b = await r.json();
    expect(b.trips.length).toBeLessThanOrEqual(50); expect(b.allTimeTotal).toBe(6000); expect(b.totalTrips).toBe(60);
  });
  it('attack: explicit ?limit=5&page=1 is honored (at most 5 trips), totals still exact', async () => {
    seed(60); const r = await GET(req('?limit=5&page=1')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.trips.length).toBeLessThanOrEqual(5); expect(b.allTimeTotal).toBe(6000); expect(b.totalTrips).toBe(60);
  });
});
