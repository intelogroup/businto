/**
 * PERMANENT REGRESSION — BUS-EARNINGS-MONTH-FILTER-001 (converted from the loop probe of cycle 2026-11-14-0052; assertions unchanged)
 * GET /api/operator/earnings: the optional `month` filter is applied only
 * when it matches /^\d{4}-\d{2}$/; any other supplied value is silently
 * ignored and the route returns the operator's UNFILTERED all-time trips.
 * (Deferred in cycle 2026-11-13-2152 as "earnings month-filter shapes".)
 * Invariant: a supplied month filter must either be honored or refused —
 * never silently dropped. A malformed month returns 400, or a 200 with
 * zero trips (filter honored as matching nothing); it must never return
 * trips outside the requested filter.
 * Harness: in-memory mocked Supabase (same pattern as the preserved
 * earnings-pagination probe). Synthetic operator/bookings only.
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
function seed() {
  h.user = { id: 'op-user-1' };
  const mk = (id: string, created: string) => ({
    id, confirmation_code: id, status: 'completed', payment_status: 'paid',
    amount: 100, created_at: created,
    request: { id: `r-${id}`, service_type: 'school', pickup_fuzzy: 'Everett', dropoff_fuzzy: 'Boston', start_date: '2026-11-10', start_time: '08:00' },
  });
  h.store.bookings = [
    mk('nov-1', '2026-11-01T00:00:00Z'), mk('nov-2', '2026-11-02T00:00:00Z'), mk('nov-3', '2026-11-03T00:00:00Z'),
    mk('oct-1', '2026-10-01T00:00:00Z'), mk('oct-2', '2026-10-02T00:00:00Z'),
  ];
}
const req = (qs = '') => new NextRequest(`http://localhost/api/operator/earnings${qs}`);
async function filteredOrRefused(qs: string) {
  const r = await GET(req(qs));
  if (r.status === 400) return true;
  if (r.status !== 200) return false;
  const b = await r.json();
  return Array.isArray(b.trips) && b.trips.length === 0;
}
describe('operator earnings month filter must never be silently dropped', () => {
  beforeEach(() => seed());
  it('control: valid ?month=2026-11 returns exactly the 3 November trips', async () => {
    const r = await GET(req('?month=2026-11')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.trips).toHaveLength(3);
  });
  it('control: no month returns all 5 trips', async () => {
    const r = await GET(req()); expect(r.status).toBe(200); const b = await r.json();
    expect(b.trips).toHaveLength(5);
  });
  it('attack: ?month=garbage is refused or matches nothing, never unfiltered', async () => {
    expect(await filteredOrRefused('?month=garbage')).toBe(true);
  });
  it('attack: near-miss shapes (2026-1, 2026-11-01, 26-11) are refused or match nothing', async () => {
    for (const m of ['2026-1', '2026-11-01', '26-11']) {
      expect(await filteredOrRefused(`?month=${m}`)).toBe(true);
    }
  });
});
