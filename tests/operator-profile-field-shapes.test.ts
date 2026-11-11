/**
 * PERMANENT REGRESSION — Phase 4 (M5), operator profile field shapes.
 * Cards: BUS-OPERATOR-PROFILE-AREAS-SHAPE-001,
 * BUS-OPERATOR-PROFILE-COMPANY-SHAPE-001.
 *
 * Invariants: on PATCH /api/operator/profile, service_areas when
 * present is an array of strings, and company_name / company_email /
 * company_phone when present are strings — every other shape is
 * refused 400 before any write, while genuine values succeed and are
 * stored verbatim.
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
    async maybeSingle() { const rows = this.exec(); return { data: rows.length ? rows[0] : null, error: null }; }
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
  h.store.operators = [{
    id: 'op-1',
    company_name: 'Synthetic Transport',
    company_email: 'ops@example.com',
    company_phone: '555-0100',
    specialties: ['school'],
    service_radius_miles: 25,
    service_areas: ['Everett'],
  }];
}
function reqFor(body: any) {
  return new NextRequest('http://localhost/api/operator/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('operator profile service_areas must be an array of strings', () => {
  beforeEach(seed);
  it('control: string-array service_areas succeed and are stored verbatim', async () => {
    const res = await PATCH(reqFor({ service_areas: ['Boston', 'Everett'] }));
    expect(res.status).toBe(200);
    expect(h.store.operators[0].service_areas).toEqual(['Boston', 'Everett']);
  });
  it('attack: string service_areas are refused 400 and store nothing', async () => {
    const res = await PATCH(reqFor({ service_areas: 'Boston' }));
    expect(res.status).toBe(400);
    expect(h.store.operators[0].service_areas).toEqual(['Everett']);
  });
  it('attack: object service_areas are refused 400 and store nothing', async () => {
    const res = await PATCH(reqFor({ service_areas: { city: 'Boston' } }));
    expect(res.status).toBe(400);
    expect(h.store.operators[0].service_areas).toEqual(['Everett']);
  });
  it('attack: non-string elements are refused 400 and store nothing', async () => {
    const res = await PATCH(reqFor({ service_areas: [12345, true] }));
    expect(res.status).toBe(400);
    expect(h.store.operators[0].service_areas).toEqual(['Everett']);
  });
});

describe('operator profile company fields must be strings', () => {
  beforeEach(seed);
  it('control: string company fields succeed and are stored verbatim', async () => {
    const res = await PATCH(reqFor({ company_name: 'New Name LLC', company_email: 'new@example.com', company_phone: '555-0199' }));
    expect(res.status).toBe(200);
    expect(h.store.operators[0].company_name).toBe('New Name LLC');
    expect(h.store.operators[0].company_email).toBe('new@example.com');
    expect(h.store.operators[0].company_phone).toBe('555-0199');
  });
  it('attack: numeric company_name is refused 400 and stores nothing', async () => {
    const res = await PATCH(reqFor({ company_name: 12345 }));
    expect(res.status).toBe(400);
    expect(h.store.operators[0].company_name).toBe('Synthetic Transport');
  });
  it('attack: boolean company_name is refused 400 and stores nothing', async () => {
    const res = await PATCH(reqFor({ company_name: true }));
    expect(res.status).toBe(400);
    expect(h.store.operators[0].company_name).toBe('Synthetic Transport');
  });
  it('attack: array company_name is refused 400 and stores nothing', async () => {
    const res = await PATCH(reqFor({ company_name: ['Evil', 'LLC'] }));
    expect(res.status).toBe(400);
    expect(h.store.operators[0].company_name).toBe('Synthetic Transport');
  });
  it('attack: object company_email is refused 400 and stores nothing', async () => {
    const res = await PATCH(reqFor({ company_email: { addr: 'x@example.com' } }));
    expect(res.status).toBe(400);
    expect(h.store.operators[0].company_email).toBe('ops@example.com');
  });
  it('attack: numeric company_phone is refused 400 and stores nothing', async () => {
    const res = await PATCH(reqFor({ company_phone: 5550100 }));
    expect(res.status).toBe(400);
    expect(h.store.operators[0].company_phone).toBe('555-0100');
  });
});
