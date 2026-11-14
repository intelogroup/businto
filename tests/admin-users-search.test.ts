/**
 * PERMANENT REGRESSION — BUS-ADMIN-USERS-SEARCH-INJECTION-001 (converted from the loop probe of cycle 2026-11-14-0952; assertions unchanged)
 * GET /api/master/admin/users interpolates the raw `search` param into
 * a PostgREST .or() filter string:
 *   `email.ilike.%${search}%,full_name.ilike.%${search}%,company_name.ilike.%${search}%`
 * (src/app/api/master/admin/users/route.ts) with no escaping. Two
 * consequences: (1) LIKE wildcards % and _ in the search act as pattern
 * wildcards instead of literals; (2) a comma in the search breaks out
 * of the ilike value and injects additional .or() filter clauses of
 * the caller's choosing (e.g. `nomatch,role.eq.operator`).
 * Invariant: the search filter is a literal case-insensitive substring
 * match over email/full_name/company_name only — it can never widen to
 * rows whose fields do not contain the literal search text, and it can
 * never add a filter on any other column.
 * Harness: in-memory mocked Supabase implementing faithful PostgREST
 * or()/ilike semantics (comma-split clauses, % = any run, _ = any
 * single char, case-insensitive). Synthetic profiles only.
 * Admin-authenticated surface: reach is an admin account, so impact is
 * filter integrity / unintended disclosure within the admin console,
 * not unauthenticated exposure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { profiles: [] };
  const state = { admin: true };
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
  function evalClause(r: any, clause: string): boolean {
    const m = clause.match(/^([^.]+)\.(ilike|eq)\.([\s\S]*)$/);
    if (!m) return false;
    const [, field, op, val] = m;
    if (op === 'eq') return String(r[field] ?? '') === val;
    return ilikeMatch(String(r[field] ?? ''), val);
  }
  class QB {
    table: string; filters: Array<(r: any) => boolean> = []; lo = 0; hi: number | null = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    order() { return this; }
    eq(k: string, v: any) { this.filters.push((r) => r[k] === v); return this; }
    range(a: number, b: number) { this.lo = a; this.hi = b; return this; }
    or(expr: string) {
      const clauses = expr.split(',');
      this.filters.push((r) => clauses.some((c) => evalClause(r, c)));
      return this;
    }
    exec() {
      let rows = [...(store[this.table] || [])];
      for (const f of this.filters) rows = rows.filter(f);
      const count = rows.length;
      if (this.hi !== null) rows = rows.slice(this.lo, this.hi + 1);
      return { rows, count };
    }
    then(res: any, rej: any) { try { const { rows, count } = this.exec(); res({ data: rows, error: null, count }); } catch (e) { rej(e); } }
  }
  return { store, QB, state };
});
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireAdmin: async () => (h.state.admin ? { id: 'admin-1', email: 'admin@synthetic.test' } : null),
}));
import { GET } from '@/app/api/master/admin/users/route';
function seed() {
  h.state.admin = true;
  h.store.profiles = [
    { id: 'u-1', email: 'alice@example.test', full_name: 'Alice Rider', company_name: null, role: 'rider', created_at: '2026-01-01' },
    { id: 'u-2', email: 'bob@transit.test', full_name: 'Bob Operator', company_name: 'Boston Transit Co', role: 'operator', created_at: '2026-01-02' },
    { id: 'u-3', email: 'carol@other.test', full_name: 'Carol Operator', company_name: 'Springfield Lines', role: 'operator', created_at: '2026-01-03' },
  ];
}
const req = (qs = '') => new NextRequest(`http://localhost/api/master/admin/users${qs}`);
const ids = (b: any) => (b.users || []).map((u: any) => u.id).sort();
describe('admin users search must be a literal substring match, never a pattern or filter injection', () => {
  beforeEach(() => seed());
  it('control: non-admin is refused 403', async () => {
    h.state.admin = false;
    const r = await GET(req('?search=alice')); expect(r.status).toBe(403);
  });
  it('control: no search returns all 3 profiles', async () => {
    const r = await GET(req()); expect(r.status).toBe(200); const b = await r.json();
    expect(ids(b)).toEqual(['u-1', 'u-2', 'u-3']);
  });
  it('control: search=alice returns exactly the alice profile', async () => {
    const r = await GET(req('?search=alice')); expect(r.status).toBe(200); const b = await r.json();
    expect(ids(b)).toEqual(['u-1']);
  });
  it('control: search with no literal match returns 0 users', async () => {
    const r = await GET(req('?search=nomatch-zzz')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.users).toHaveLength(0);
  });
  it('attack: search=% is literal — no field contains %, so 0 users', async () => {
    const r = await GET(req('?search=%25')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.users).toHaveLength(0);
  });
  it('attack: search=_lice is literal — 0 users (underscore must not match a)', async () => {
    const r = await GET(req('?search=_lice')); expect(r.status).toBe(200); const b = await r.json();
    expect(b.users).toHaveLength(0);
  });
  it('attack: comma injection cannot add a role filter — search "nomatch%,role.ilike.operato" is refused', async () => {
    // The template appends "%," after the search, so an injected
    // `role.ilike.operato` clause is completed by the template's own
    // trailing % into the pattern `operato%`, matching role=operator.
    // CONVERSION NOTE (Lane B, 2026-11-14): this leg's status
    // assertion changed 200 → 400 under the approved systemic plan —
    // a term carrying PostgREST grammar characters is REFUSED by
    // parseSearchTerm before any filter is built (never interpolated
    // at all), which enforces this leg's invariant (no added clause,
    // no widened result) strictly more strongly than the probe's
    // original 200-with-0-users shape. Every other leg is verbatim.
    const qs = '?search=' + encodeURIComponent('nomatch%,role.ilike.operato');
    const r = await GET(req(qs)); expect(r.status).toBe(400);
  });
});
