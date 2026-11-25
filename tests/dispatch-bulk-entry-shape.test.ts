/**
 * PERMANENT REGRESSION — BUS-DISPATCH-QUOTE-ENTRY-SHAPE-001 (converted from the loop probe of cycle 2026-11-23-1852; assertions unchanged)
 * POST /api/master/admin/dispatch action=create_quotes_bulk
 * (src/app/api/master/admin/dispatch/route.ts:397) guards only that
 * `quotes` is a non-empty array, then maps entries with q.operatorId /
 * q.price / q.vehicleType with no per-entry shape check.
 * Invariant: every bulk quote entry must be an object carrying the
 * required fields; any non-object entry is refused 400 before any
 * insert and never produces a 500, while a genuine entry succeeds.
 * Harness: in-memory mocked Supabase; synthetic admin/request/operator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { transport_requests: [], operators: [], quotes: [] };
  const inserts: any[] = [];
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null; inMode = false;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    in(k: string, vs: any[]) { vs.forEach((v) => this.filters.push([k, v])); this.inMode = true; return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; inserts.push(p); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    match(r: Row) {
      if (this.inMode) return this.filters.some(([k, v]) => r[k] === v);
      return this.filters.every(([k, v]) => r[k] === v);
    }
    exec() {
      const rows = store[this.table] || (store[this.table] = []);
      if (this.op === 'insert') {
        const arr = Array.isArray(this.payload) ? this.payload : [this.payload];
        const made = arr.map((p, i) => ({ id: `quote-${i + 1}`, ...p }));
        made.forEach((m) => rows.push(m));
        return made;
      }
      if (this.op === 'update') { const m = rows.filter((r) => this.match(r)); m.forEach((r) => Object.assign(r, this.payload)); return m; }
      return rows.filter((r) => this.match(r));
    }
    async single() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }; }
    async maybeSingle() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: null }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, inserts, QB };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireAdmin: async () => ({ id: 'admin-1', email: 'admin@example.com' }),
  requireUser: async () => null,
}));
vi.mock('@/lib/email', () => ({
  sendEmail: async () => undefined,
  emailTemplates: { quotesBulkReceived: (x: any) => ({ subject: 'q', html: 'q' }) },
  getAppBaseUrl: () => 'http://localhost',
}));
vi.mock('@/lib/email-helpers', () => ({ generateOperatorQuoteLink: async () => 'http://localhost/x' }));
vi.mock('@/lib/operator-matching', () => ({ extractRequirements: () => ({}) }));
vi.mock('@/lib/event-logger', () => ({ logEvent: async () => undefined }));

import { POST } from '@/app/api/master/admin/dispatch/route';

function seed() {
  h.inserts.length = 0;
  h.store.transport_requests = [{ id: 'req-1', status: 'pending', user_id: null }];
  h.store.operators = [{ id: 'op-1', company_name: 'Synthetic Transport', company_email: 'op@example.com' }];
  h.store.quotes = [];
}
function reqFor(entry: any) {
  return new NextRequest('http://localhost/api/master/admin/dispatch', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create_quotes_bulk', requestId: 'req-1', quotes: [entry] }),
  });
}

describe('admin dispatch create_quotes_bulk entries must be objects', () => {
  beforeEach(seed);
  it('control: genuine entry succeeds and inserts exactly one quote', async () => {
    const res = await POST(reqFor({ operatorId: 'op-1', price: 150, vehicleType: 'van' }));
    expect(res.status).toBe(200);
    expect(h.store.quotes).toHaveLength(1);
  });
  it('attack: null entry is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor(null));
    expect(res.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });
  it('attack: numeric entry is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor(123));
    expect(res.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });
  it('attack: string entry is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor('op-1'));
    expect(res.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });
  it('attack: boolean entry is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor(true));
    expect(res.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });
  it('attack: array entry is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor(['op-1', 150, 'van']));
    expect(res.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });
  it('attack: mixed batch (one genuine, one null) is refused 400 and inserts nothing', async () => {
    const req = new NextRequest('http://localhost/api/master/admin/dispatch', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'create_quotes_bulk', requestId: 'req-1', quotes: [{ operatorId: 'op-1', price: 150, vehicleType: 'van' }, null] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });
});
