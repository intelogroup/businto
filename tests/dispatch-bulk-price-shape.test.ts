/**
 * PERMANENT REGRESSION — BUS-DISPATCH-QUOTE-PRICE-SHAPE-001 (bulk leg) (converted from the loop probe of cycle 2026-11-19-1252; assertions unchanged)
 * POST /api/master/admin/dispatch action=create_quotes_bulk
 * (src/app/api/master/admin/dispatch/route.ts) maps each quote's price
 * straight into quotes.total_price with no guard at all — not even the
 * truthiness check the single create_quote branch has. This executes
 * the bulk leg named by inspection in BUS-DISPATCH-QUOTE-PRICE-SHAPE-001.
 * Invariant: every bulk quote's total_price must be a positive finite
 * JSON number; any non-number shape or non-positive value is refused
 * 400 before any insert, while a genuine positive number succeeds and
 * is stored verbatim.
 * Harness: in-memory mocked Supabase; synthetic admin/request/operator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { transport_requests: [], operators: [], quotes: [] };
  const inserts: any[] = [];
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    in(k: string, vs: any[]) { vs.forEach((v) => this.filters.push([k, v])); this.inMode = true; return this; }
    inMode = false;
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
function reqFor(price: any) {
  return new NextRequest('http://localhost/api/master/admin/dispatch', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create_quotes_bulk', requestId: 'req-1', quotes: [{ operatorId: 'op-1', price, vehicleType: 'van' }] }),
  });
}
const insertedPrices = () => h.inserts.flatMap((p: any) => (Array.isArray(p) ? p : [p]).map((q: any) => q.total_price));

describe('admin dispatch create_quotes_bulk price must be a positive number', () => {
  beforeEach(seed);
  it('control: numeric price succeeds and is stored verbatim', async () => {
    const res = await POST(reqFor(150));
    expect(res.status).toBe(200);
    expect(insertedPrices()).toEqual([150]);
  });
  it('control: empty quotes array is refused 400 and inserts nothing', async () => {
    const req = new NextRequest('http://localhost/api/master/admin/dispatch', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'create_quotes_bulk', requestId: 'req-1', quotes: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });
  it('attack: string price is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor('150'));
    expect(res.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });
  it('attack: negative price is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor(-50));
    expect(res.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });
  it('attack: zero price is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor(0));
    expect(res.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });
  it('attack: boolean price is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor(true));
    expect(res.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });
  it('attack: array price is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor([150]));
    expect(res.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });
});
