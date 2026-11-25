/**
 * PERMANENT REGRESSION — BUS-OPERATOR-RADIUS-COERCION-001 (converted from the loop probe of cycle 2026-11-19-0052; assertions unchanged)
 * PATCH /api/operator/profile validates service_radius_miles with
 * Number(value) coercion + range, unlike its sibling fields which use
 * type-first boundary parsers (parseTextField / parseStringArray).
 * Number(true)=1, Number("50")=50, Number([50])=50 all pass the range
 * check and are stored as numbers the caller never sent as numbers.
 * Invariant: service_radius_miles, when present, must be a finite JSON
 * number in 1..500; any non-number shape is refused 400 before any
 * write, while a genuine number succeeds and is stored verbatim.
 * Harness: in-memory mocked Supabase; synthetic operator only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { operators: [], operator_profiles: [] };
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    match(r: Row) { return this.filters.every(([k, v]) => r[k] === v); }
    exec() {
      const rows = store[this.table] || (store[this.table] = []);
      if (this.op === 'update') { const m = rows.filter((r) => this.match(r)); m.forEach((r) => Object.assign(r, this.payload)); return m; }
      return rows.filter((r) => this.match(r));
    }
    async single() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }; }
    async maybeSingle() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: null }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireUser: async () => ({ id: 'user-op-1', email: 'op@example.com' }),
  requireAdmin: async () => null,
}));
vi.mock('@/lib/event-logger', () => ({ logEvent: async () => undefined }));

import { PATCH } from '@/app/api/operator/profile/route';

function seed() {
  h.store.operator_profiles = [{ id: 'user-op-1', operator_id: 'op-1' }];
  h.store.operators = [{ id: 'op-1', company_name: 'Synthetic Transport', specialties: ['school'], service_radius_miles: 25, service_areas: ['Everett'] }];
}
function reqFor(body: any) {
  return new NextRequest('http://localhost/api/operator/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('operator profile service_radius_miles must be a number before range', () => {
  beforeEach(seed);
  it('control: numeric radius succeeds and is stored verbatim', async () => {
    const res = await PATCH(reqFor({ service_radius_miles: 50 }));
    expect(res.status).toBe(200);
    expect(h.store.operators[0].service_radius_miles).toBe(50);
  });
  it('control: out-of-range numbers are refused 400 and store nothing', async () => {
    for (const v of [0, 501]) {
      seed();
      const res = await PATCH(reqFor({ service_radius_miles: v }));
      expect(res.status).toBe(400);
      expect(h.store.operators[0].service_radius_miles).toBe(25);
    }
  });
  it('attack: boolean radius is refused 400 and stores nothing', async () => {
    const res = await PATCH(reqFor({ service_radius_miles: true }));
    expect(res.status).toBe(400);
    expect(h.store.operators[0].service_radius_miles).toBe(25);
  });
  it('attack: string radius is refused 400 and stores nothing', async () => {
    const res = await PATCH(reqFor({ service_radius_miles: '50' }));
    expect(res.status).toBe(400);
    expect(h.store.operators[0].service_radius_miles).toBe(25);
  });
  it('attack: single-element array radius is refused 400 and stores nothing', async () => {
    const res = await PATCH(reqFor({ service_radius_miles: [50] }));
    expect(res.status).toBe(400);
    expect(h.store.operators[0].service_radius_miles).toBe(25);
  });
});
