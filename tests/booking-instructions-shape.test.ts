/**
 * PERMANENT REGRESSION — Phase 4 (M5).
 * Card: BUS-BOOKING-INSTRUCTIONS-SHAPE-001.
 *
 * Invariant: special_instructions on PATCH /api/bookings, when
 * present, is a string before it is stored; any other shape is
 * refused 400 before any write, while a genuine string succeeds and
 * is stored verbatim.
 * Harness: in-memory mocked Supabase; synthetic rider/booking only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { bookings: [] };
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
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireUser: async () => ({ id: 'rider-1', email: 'rider@example.com' }),
  requireAdmin: async () => null,
}));

import { PATCH } from '@/app/api/bookings/route';

function seed() {
  h.store.bookings = [{ id: 'bk-1', user_id: 'rider-1', status: 'confirmed', special_instructions: null }];
}
function reqFor(body: any) {
  return new NextRequest('http://localhost/api/bookings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('booking special_instructions must be a string', () => {
  beforeEach(seed);
  it('control: string instructions succeed and are stored verbatim', async () => {
    const res = await PATCH(reqFor({ bookingId: 'bk-1', special_instructions: 'Wheelchair lift please' }));
    expect(res.status).toBe(200);
    expect(h.store.bookings[0].special_instructions).toBe('Wheelchair lift please');
  });
  it('attack: numeric instructions 12345 are refused 400 and store nothing', async () => {
    const res = await PATCH(reqFor({ bookingId: 'bk-1', special_instructions: 12345 }));
    expect(res.status).toBe(400);
    expect(h.store.bookings[0].special_instructions).toBeNull();
  });
  it('attack: boolean instructions true are refused 400 and store nothing', async () => {
    const res = await PATCH(reqFor({ bookingId: 'bk-1', special_instructions: true }));
    expect(res.status).toBe(400);
    expect(h.store.bookings[0].special_instructions).toBeNull();
  });
  it('attack: array instructions are refused 400 and store nothing', async () => {
    const res = await PATCH(reqFor({ bookingId: 'bk-1', special_instructions: ['lift'] }));
    expect(res.status).toBe(400);
    expect(h.store.bookings[0].special_instructions).toBeNull();
  });
  it('attack: object instructions are refused 400 and store nothing', async () => {
    const res = await PATCH(reqFor({ bookingId: 'bk-1', special_instructions: { note: 'lift' } }));
    expect(res.status).toBe(400);
    expect(h.store.bookings[0].special_instructions).toBeNull();
  });
});
