/**
 * PERMANENT REGRESSION — BUS-ADMIN-EXCHANGES-PAGINATION-001 (converted from the loop probe of cycle 2026-11-13-0652; assertions unchanged)
 * GET /api/master/admin/exchanges returns every booking with
 * requires_manual_exchange=true in one unbounded response: no
 * .range(), no .limit(), and it ignores page/limit query params.
 * Every sibling admin list endpoint (users, requests, disputes,
 * directory) paginates with default 20 and max 50 — those bounds are
 * the verified-fixed BUS-*-PAGINATION-001 family pattern.
 * Invariant: an admin list response is bounded to at most 50 rows
 * per page, whatever the queue size; small queues return exactly.
 * Harness: in-memory mocked Supabase honoring range/limit if the
 * route ever calls them; synthetic bookings only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { bookings: [] };
  class QB {
    table: string; filters: Array<[string, any]> = []; lo = 0; hi: number | null = null; lim: number | null = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    order() { return this; }
    range(a: number, b: number) { this.lo = a; this.hi = b; return this; }
    limit(n: number) { this.lim = n; return this; }
    exec() {
      let rows = (store[this.table] || []).filter((r) => this.filters.every(([k, v]) => r[k] === v));
      if (this.hi !== null) rows = rows.slice(this.lo, this.hi + 1);
      if (this.lim !== null) rows = rows.slice(0, this.lim);
      return rows;
    }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB, admin: true };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireAdmin: async () => (h.admin ? { id: 'admin-1' } : null),
}));

import { GET } from '@/app/api/master/admin/exchanges/route';

function seed(n: number) {
  h.store.bookings = Array.from({ length: n }, (_, i) => ({
    id: `booking-${i + 1}`, created_at: '2026-11-01T00:00:00Z', amount: 100, confirmation_code: `C-${i + 1}`,
    request_id: `req-${i + 1}`, operator_id: 'op-1', user_id: `user-${i + 1}`, requires_manual_exchange: true,
  }));
  h.admin = true;
}
const req = (qs = '') => new NextRequest(`http://localhost/api/master/admin/exchanges${qs}`);

describe('admin exchanges list must be bounded like its sibling admin lists', () => {
  beforeEach(() => seed(0));
  it('control: non-admin is refused 403', async () => {
    h.admin = false;
    const res = await GET(req());
    expect(res.status).toBe(403);
  });
  it('control: small queue (2 pending) returns exactly 2', async () => {
    seed(2);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exchanges).toHaveLength(2);
  });
  it('attack: a 60-row pending queue returns at most 50 rows in one response', async () => {
    seed(60);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exchanges.length).toBeLessThanOrEqual(50);
  });
  it('attack: explicit ?limit=5 is honored (at most 5 rows)', async () => {
    seed(60);
    const res = await GET(req('?limit=5&page=1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exchanges.length).toBeLessThanOrEqual(5);
  });
});
