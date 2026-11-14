/**
 * PERMANENT REGRESSION — BUS-DIRECTORY-LOCATION-WILDCARD-001 (converted from the loop probe of cycle 2026-11-14-0652; assertions unchanged)
 * GET /api/operators/directory?location=<text> interpolates the raw
 * location into a PostgREST ilike pattern `%${location}%`
 * (src/app/api/operators/directory/route.ts:59) with no escaping of
 * the LIKE wildcards % and _. A caller-supplied % or _ therefore acts
 * as a pattern wildcard instead of a literal character, widening the
 * filter beyond the literal substring the caller named.
 * Invariant: the location filter is a literal case-insensitive
 * substring match — wildcard characters in the input match only
 * themselves, never other characters.
 * Harness: in-memory mocked Supabase implementing faithful ilike
 * pattern semantics (% = any run, _ = any single char, case-insens).
 * Synthetic operators only; public directory data only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { operators: [] };
  function ilikeMatch(value: string, pattern: string): boolean {
    let re = '^';
    for (const ch of pattern) {
      if (ch === '%') re += '.*';
      else if (ch === '_') re += '.';
      else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    re += '$';
    return new RegExp(re, 'i').test(value);
  }
  class QB {
    table: string; filters: Array<(r: any) => boolean> = []; lo = 0; hi: number | null = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push((r) => r[k] === v); return this; }
    contains(k: string, v: any[]) { this.filters.push((r) => Array.isArray(r[k]) && v.every((x) => r[k].includes(x))); return this; }
    ilike(k: string, pattern: string) { this.filters.push((r) => ilikeMatch(String(r[k] ?? ''), pattern)); return this; }
    order() { return this; }
    range(a: number, b: number) { this.lo = a; this.hi = b; return this; }
    exec() {
      let rows = [...(store[this.table] || [])];
      for (const f of this.filters) rows = rows.filter(f);
      const count = rows.length;
      if (this.hi !== null) rows = rows.slice(this.lo, this.hi + 1);
      return { rows, count };
    }
    then(res: any, rej: any) { try { const { rows, count } = this.exec(); res({ data: rows, error: null, count }); } catch (e) { rej(e); } }
  }
  return { store, QB };
});
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
}));
import { GET } from '@/app/api/operators/directory/route';
function seed() {
  h.store.operators = [
    { id: 'op-1', company_name: 'Boston Co', specialties: ['school'], service_areas: 'Boston, Cambridge', service_radius_miles: 25, rating: 5, total_reviews: 3, is_verified: true, is_active: true, is_partner: false },
    { id: 'op-2', company_name: 'Springfield Co', specialties: ['medical'], service_areas: 'Springfield', service_radius_miles: 25, rating: 4, total_reviews: 2, is_verified: true, is_active: true, is_partner: false },
    { id: 'op-3', company_name: 'Worcester Co', specialties: ['wedding'], service_areas: 'Worcester', service_radius_miles: 25, rating: 4, total_reviews: 1, is_verified: true, is_active: true, is_partner: false },
  ];
}
const req = (qs = '') => new NextRequest(`http://localhost/api/operators/directory${qs}`);
describe('directory location filter must be a literal substring match, not a LIKE pattern', () => {
  beforeEach(() => seed());
  it('control: no location returns all 3 verified operators', async () => {
    const r = await GET(req()); expect(r.status).toBe(200); const b = await r.json();
    expect(b.operators).toHaveLength(3); expect(b.total).toBe(3);
  });
  it('control: location=Boston returns exactly the Boston operator', async () => {
    const r = await GET(req('?location=Boston')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.operators).toHaveLength(1); expect(b.operators[0].id).toBe('op-1');
  });
  it('control: location=boston (case-insensitive) returns exactly the Boston operator', async () => {
    const r = await GET(req('?location=boston')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.operators).toHaveLength(1); expect(b.operators[0].id).toBe('op-1');
  });
  it('attack: location=% is literal — no service area contains %, so 0 operators', async () => {
    const r = await GET(req('?location=%25')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.operators).toHaveLength(0);
  });
  it('attack: location=_oston is literal — 0 operators (underscore must not match B)', async () => {
    const r = await GET(req('?location=_oston')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.operators).toHaveLength(0);
  });
  it('attack: location=B_ston is literal — 0 operators', async () => {
    const r = await GET(req('?location=B_ston')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.operators).toHaveLength(0);
  });
});
