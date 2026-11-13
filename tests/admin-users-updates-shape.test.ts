/**
 * PERMANENT REGRESSION — BUS-ADMIN-USERS-UPDATES-SHAPE-001 (converted from the loop probe of cycle 2026-11-12-0052; assertions unchanged)
 * PATCH /api/master/admin/users (src/app/api/master/admin/users/route.ts)
 * destructures { userId, updates } from the JSON body, checks only that
 * userId is present, then runs Object.keys(updates) to allow-list fields.
 * The repo's own master-admin-users.test.ts never calls the route — it
 * re-implements the filter inline — so the route's behaviour on a
 * missing / null / non-object `updates` has never been executed.
 * Invariant: a PATCH whose `updates` is missing or not a plain object
 * must be refused 400 BEFORE any data-layer write (never a 500 from
 * Object.keys on null/undefined, never a 200 carrying an empty update),
 * while a genuine object update succeeds with only allow-listed fields.
 * Harness: in-memory mocked Supabase recording every update payload;
 * admin gate satisfied by the mock (synthetic admin). Synthetic user only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  const updatePayloads: any[] = [];
  const store: Record<string, any> = {
    profiles: [{ id: 'user-1', role: 'rider', is_verified: false }],
  };
  class QB {
    table: string; filters: Array<[string, any]> = []; payload: any = null; isUpdate = false;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    update(p: any) { this.isUpdate = true; this.payload = p; updatePayloads.push(p); return this; }
    async single() {
      const rows = store[this.table] || [];
      const m = rows.filter((r: any) => this.filters.every(([k, v]) => r[k] === v));
      if (this.isUpdate) { m.forEach((r: any) => Object.assign(r, this.payload)); }
      return m.length ? { data: m[0], error: null } : { data: null, error: { message: 'not found' } };
    }
  }
  return { store, updatePayloads, QB };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  supabase: { from: (t: string) => new h.QB(t) },
  requireAdmin: async () => ({ id: 'admin-1', email: 'admin@synthetic.test' }),
  requireUser: async () => ({ id: 'admin-1' }),
}));
vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  supabase: { from: (t: string) => new h.QB(t) },
  requireAdmin: async () => ({ id: 'admin-1', email: 'admin@synthetic.test' }),
  requireUser: async () => ({ id: 'admin-1' }),
}));

import { PATCH } from '@/app/api/master/admin/users/route';

function reqFor(body: any) {
  return new NextRequest('http://localhost/api/master/admin/users', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('admin users PATCH must validate the updates shape', () => {
  beforeEach(() => {
    h.updatePayloads.length = 0;
    h.store.profiles = [{ id: 'user-1', role: 'rider', is_verified: false }];
  });

  it('control: object updates succeeds, allow-list applied', async () => {
    const res = await PATCH(reqFor({ userId: 'user-1', updates: { role: 'operator', malicious_field: 'x' } }));
    expect(res.status).toBe(200);
    expect(h.updatePayloads).toEqual([{ role: 'operator' }]);
    expect(h.store.profiles[0].role).toBe('operator');
  });

  it('attack: missing updates is refused 400 with no write', async () => {
    const res = await PATCH(reqFor({ userId: 'user-1' }));
    expect(res.status).toBe(400);
    expect(h.updatePayloads).toEqual([]);
  });

  it('attack: null updates is refused 400 with no write', async () => {
    const res = await PATCH(reqFor({ userId: 'user-1', updates: null }));
    expect(res.status).toBe(400);
    expect(h.updatePayloads).toEqual([]);
  });

  it('attack: string updates is refused 400 with no write', async () => {
    const res = await PATCH(reqFor({ userId: 'user-1', updates: 'role=admin' }));
    expect(res.status).toBe(400);
    expect(h.updatePayloads).toEqual([]);
  });

  it('attack: numeric updates is refused 400 with no write', async () => {
    const res = await PATCH(reqFor({ userId: 'user-1', updates: 12345 }));
    expect(res.status).toBe(400);
    expect(h.updatePayloads).toEqual([]);
  });

  it('attack: array updates is refused 400 with no write', async () => {
    const res = await PATCH(reqFor({ userId: 'user-1', updates: ['role'] }));
    expect(res.status).toBe(400);
    expect(h.updatePayloads).toEqual([]);
  });
});
