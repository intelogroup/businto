/**
 * PERMANENT REGRESSION — BUS-CUSTOMER-PROFILE-PREFS-SHAPE-001 (converted from the loop probe of cycle 2026-11-13-0352; assertions unchanged)
 * PATCH /api/customer/profile (src/app/api/customer/profile/route.ts)
 * validates transport_preferences with `prefs !== null && typeof prefs
 * !== 'object'` — arrays pass typeof 'object', carry no
 * default_mobility/default_service_level keys for the enum checks, and
 * are written verbatim into the profiles.transport_preferences jsonb
 * column. The repo's own customer-profile.test.ts even notes "Arrays
 * are objects in JS, so we need additional check" — the route never
 * makes that check.
 * Invariant: transport_preferences must be a plain object or null;
 * an array (or any other non-plain-object shape) is refused 400 before
 * any profile write, while a genuine object and null succeed exactly.
 * Harness: in-memory mocked Supabase; synthetic user only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { profiles: [] };
  const writes: any[] = [];
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; writes.push(p); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; writes.push(p); return this; }
    match(r: Row) { return this.filters.every(([k, v]) => r[k] === v); }
    exec() {
      const rows = store[this.table] || (store[this.table] = []);
      if (this.op === 'insert') { const row = { ...this.payload }; rows.push(row); return [row]; }
      if (this.op === 'update') { const m = rows.filter((r) => this.match(r)); m.forEach((r) => Object.assign(r, this.payload)); return m; }
      return rows.filter((r) => this.match(r));
    }
    async single() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }; }
    async maybeSingle() { const rows = this.exec(); return { data: rows.length ? rows[0] : null, error: null }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, writes, QB };
});

vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: {
    from: (t: string) => new h.QB(t),
    auth: { admin: { updateUserById: async () => ({ data: null, error: null }) } },
  },
  requireUser: async () => ({ id: 'user-1', email: 'rider@example.com', user_metadata: {} }),
  requireAdmin: async () => null,
}));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (t: string) => new h.QB(t),
    auth: { admin: { updateUserById: async () => ({ data: null, error: null }) } },
  },
  requireUser: async () => ({ id: 'user-1', email: 'rider@example.com', user_metadata: {} }),
  requireAdmin: async () => null,
}));

import { PATCH } from '@/app/api/customer/profile/route';

function seed() {
  h.store.profiles = [{ id: 'user-1', full_name: 'Rider One', email: 'rider@example.com', phone: '', sms_opt_in: false, transport_preferences: null }];
  h.writes.length = 0;
}
function reqFor(body: any) {
  return new NextRequest('http://localhost/api/customer/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('customer profile transport_preferences must be a plain object or null', () => {
  beforeEach(seed);
  it('control: valid preferences object succeeds and is stored exactly', async () => {
    const prefs = { default_mobility: 'wheelchair', default_service_level: 'door-to-door' };
    const res = await PATCH(reqFor({ transport_preferences: prefs }));
    expect(res.status).toBe(200);
    expect(h.writes.length).toBe(1);
    expect(h.store.profiles[0].transport_preferences).toEqual(prefs);
  });
  it('control: null preferences succeeds (clears saved data)', async () => {
    const res = await PATCH(reqFor({ transport_preferences: null }));
    expect(res.status).toBe(200);
    expect(h.store.profiles[0].transport_preferences).toBeNull();
  });
  it('control: string preferences is refused 400 with no write', async () => {
    const res = await PATCH(reqFor({ transport_preferences: 'wheelchair' }));
    expect(res.status).toBe(400);
    expect(h.writes.length).toBe(0);
  });
  it('control: invalid mobility string is refused 400 with no write', async () => {
    const res = await PATCH(reqFor({ transport_preferences: { default_mobility: 'flying' } }));
    expect(res.status).toBe(400);
    expect(h.writes.length).toBe(0);
  });
  it('control: array-valued mobility field is refused 400 with no write', async () => {
    const res = await PATCH(reqFor({ transport_preferences: { default_mobility: ['wheelchair'] } }));
    expect(res.status).toBe(400);
    expect(h.writes.length).toBe(0);
  });
  it('attack: array preferences [{...}] is refused 400 and stores nothing', async () => {
    const res = await PATCH(reqFor({ transport_preferences: [{ default_mobility: 'wheelchair' }] }));
    expect(res.status).toBe(400);
    expect(h.writes.length).toBe(0);
    expect(h.store.profiles[0].transport_preferences).toBeNull();
  });
  it('attack: empty array preferences [] is refused 400 and stores nothing', async () => {
    const res = await PATCH(reqFor({ transport_preferences: [] }));
    expect(res.status).toBe(400);
    expect(h.writes.length).toBe(0);
    expect(h.store.profiles[0].transport_preferences).toBeNull();
  });
});
