/**
 * PERMANENT REGRESSION — BUS-ADMIN-REQUESTS-STATUS-001 (converted from the loop probe of cycle 2026-11-15-0052; assertions unchanged)
 * GET /api/master/admin/requests hostile status + pagination shapes.
 * Sibling admin disputes route refuses out-of-vocabulary status 400
 * (VALID_DISPUTE_STATUSES) and the rider requests route refuses
 * out-of-vocabulary status 400 (Lane B); this route passes any status
 * string straight to eq('status', status).
 * Invariant: a supplied status is a valid transport-request status (or
 * the documented 'active' alias) honored literally, or refused 400 —
 * never a silent empty 200 for out-of-vocabulary status, never 500,
 * never widened; hostile pagination refused 400; valid control exact.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { transport_requests: [] };
  const state = { admin: { id: 'admin-1' } as any };
  class QB {
    table: string; filters: Array<(r: any) => boolean> = []; lo = 0; hi: number | null = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push((r) => r[k] === v); return this; }
    in(k: string, vs: any[]) { this.filters.push((r) => vs.includes(r[k])); return this; }
    order() { return this; }
    range(a: number, b: number) { this.lo = a; this.hi = b; return this; }
    exec() { let rows = [...(store[this.table] || [])]; for (const f of this.filters) rows = rows.filter(f); const total = rows.length; if (this.hi !== null) rows = rows.slice(this.lo, this.hi + 1); return { rows, total }; }
    then(res: any, rej: any) { try { const { rows, total } = this.exec(); res({ data: rows, error: null, count: total }); } catch (e) { rej(e); } }
  }
  return { store, state, QB };
});
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (t: string) => new h.QB(t) }, requireAdmin: async () => h.state.admin }));
import { GET } from '@/app/api/master/admin/requests/route';
function seed() { h.state.admin = { id: 'admin-1' }; h.store.transport_requests = [
  ...Array.from({ length: 4 }, (_, i) => ({ id: `p-${i + 1}`, status: 'pending' })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: `q-${i + 1}`, status: 'quoted' })),
  { id: 'b-1', status: 'booked' },
]; }
const req = (qs = '') => new NextRequest(`http://localhost/api/master/admin/requests${qs}`);
describe('admin requests hostile status shapes', () => {
  beforeEach(() => seed());
  it('control: non-admin refused 403', async () => { h.state.admin = null; const r = await GET(req()); expect(r.status).toBe(403); });
  it('control: valid status + active alias + pagination exact', async () => {
    let r = await GET(req('?status=pending')); expect(r.status).toBe(200); let b = await r.json(); expect(b.requests).toHaveLength(4); expect(b.total).toBe(4);
    r = await GET(req('?status=active')); b = await r.json(); expect(b.requests).toHaveLength(7);
    r = await GET(req('?limit=3&page=2')); b = await r.json(); expect(b.requests).toHaveLength(3); expect(b.total).toBe(8);
  });
  it('attack: hostile pagination shapes refused 400, never 500', async () => {
    for (const qs of ['?page=abc', '?page=1.5', '?page=-1', '?page=0', '?page=1e2', '?page=%201', '?limit=abc', '?limit=2.5', '?limit=-5', '?limit=0', '?limit=1e3', '?limit=%205']) {
      const r = await GET(req(qs)); expect(r.status, qs).toBe(400);
    }
  });
  it('attack: out-of-vocabulary status refused 400, never silent empty 200 / 500 / widened', async () => {
    for (const qs of ['?status=__proto__', '?status=constructor', '?status=PENDING', '?status=pending,quoted', '?status=%', '?status=%20pending', '?status=nonexistent']) {
      const r = await GET(req(qs)); expect(r.status, qs).toBe(400);
    }
  });
});
