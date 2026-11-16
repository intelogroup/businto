/**
 * PERMANENT REGRESSION — BUS-BOOKINGS-STATUS-001 (converted from the loop probe of cycle 2026-11-15-0352; assertions unchanged)
 * GET /api/bookings hostile status shapes. Sibling rider requests route
 * refuses out-of-vocabulary status 400 via parseEnumParam (Lane B) and
 * admin disputes does the same; this route passes any status string
 * straight to eq('status', status).
 * Booking vocabulary (route + cron): confirmed, in_progress, completed, cancelled.
 * Invariant: a supplied status is in that vocabulary honored literally,
 * or refused 400 — never a silent empty 200, never 500, never widened;
 * hostile pagination refused 400; user scoping always holds; control exact.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { bookings: [] };
  const state = { user: { id: 'user-1' } as any };
  class QB {
    table: string; filters: Array<(r: any) => boolean> = []; lo = 0; hi: number | null = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push((r) => r[k] === v); return this; }
    order() { return this; }
    range(a: number, b: number) { this.lo = a; this.hi = b; return this; }
    then(res: any, rej: any) { try { let rows = [...(store[this.table] || [])]; for (const f of this.filters) rows = rows.filter(f); if (this.hi !== null) rows = rows.slice(this.lo, this.hi + 1); res({ data: rows, error: null }); } catch (e) { rej(e); } }
  }
  return { store, state, QB };
});
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (t: string) => new h.QB(t) }, requireUser: async () => h.state.user }));
import { GET } from '@/app/api/bookings/route';
function seed() { h.state.user = { id: 'user-1' }; h.store.bookings = [
  ...Array.from({ length: 3 }, (_, i) => ({ id: `c-${i + 1}`, status: 'confirmed', user_id: 'user-1' })),
  { id: 'done-1', status: 'completed', user_id: 'user-1' },
  { id: 'x-1', status: 'cancelled', user_id: 'user-1' },
  { id: 'foreign-1', status: 'confirmed', user_id: 'user-2' },
]; }
const req = (qs = '') => new NextRequest(`http://localhost/api/bookings${qs}`);
describe('bookings hostile status shapes', () => {
  beforeEach(() => seed());
  it('control: unauthenticated refused 401', async () => { h.state.user = null; const r = await GET(req()); expect(r.status).toBe(401); });
  it('control: valid status + no-status + scoping exact', async () => {
    let r = await GET(req('?status=confirmed')); expect(r.status).toBe(200); let b = await r.json(); expect(b.bookings).toHaveLength(3);
    r = await GET(req()); b = await r.json(); expect(b.bookings).toHaveLength(5);
    r = await GET(req('?status=completed')); b = await r.json(); expect(b.bookings).toHaveLength(1);
  });
  it('attack: hostile pagination shapes refused 400, never 500', async () => {
    for (const qs of ['?page=abc', '?page=1.5', '?page=-1', '?page=0', '?limit=abc', '?limit=2.5', '?limit=-5', '?limit=0']) {
      const r = await GET(req(qs)); expect(r.status, qs).toBe(400);
    }
  });
  it('attack: out-of-vocabulary status refused 400, never silent empty 200 / 500 / widened', async () => {
    for (const qs of ['?status=__proto__', '?status=constructor', '?status=CONFIRMED', '?status=confirmed,completed', '?status=%', '?status=%20confirmed', '?status=nonexistent']) {
      const r = await GET(req(qs)); expect(r.status, qs).toBe(400);
    }
  });
});
