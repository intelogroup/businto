/**
 * PERMANENT REGRESSION — BUS-DISPATCH-QUOTE-VEHICLE-SHAPE-001 (bulk leg) (converted from the loop probe of cycle 2026-11-20-0052; assertions unchanged)
 * POST /api/master/admin/dispatch action=create_quotes_bulk: per-quote
 * vehicleType is never validated (the bulk branch has no field guard at
 * all); values are inserted verbatim as quotes.vehicle_type and passed to
 * the bulk email template. Sibling surface of BUS-DISPATCH-QUOTE-VEHICLE-
 * SHAPE-001 (single create_quote branch, confirmed 2026-11-19-1852).
 * Invariant: every bulk quote's vehicle_type must be a non-empty string;
 * any non-string or missing shape is refused 400 before any insert, while
 * genuine strings succeed.
 * Harness: in-memory mocked Supabase; synthetic admin/request/operators.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { transport_requests: [], operators: [], quotes: [], unified_profiles: [] };
  const inserts: any[] = [];
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; inFilters: Array<[string, any[]]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    in(k: string, v: any[]) { this.inFilters.push([k, v]); return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; (Array.isArray(p) ? p : [p]).forEach((x) => inserts.push(x)); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    match(r: Row) { return this.filters.every(([k, v]) => r[k] === v) && this.inFilters.every(([k, v]) => v.includes(r[k])); }
    exec() {
      const rows = store[this.table] || (store[this.table] = []);
      if (this.op === 'insert') { const ps = Array.isArray(this.payload) ? this.payload : [this.payload]; const made = ps.map((p, i) => ({ id: `quote-${i + 1}`, ...p })); rows.push(...made); return made; }
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
  emailTemplates: { quoteReceived: (x: any) => ({ subject: 'q', html: 'q' }), quotesBulkReceived: (x: any) => ({ subject: 'q', html: 'q' }) },
  getAppBaseUrl: () => 'http://localhost',
}));
vi.mock('@/lib/email-helpers', () => ({ generateOperatorQuoteLink: async () => 'http://localhost/x' }));
vi.mock('@/lib/operator-matching', () => ({ extractRequirements: () => ({}) }));
vi.mock('@/lib/event-logger', () => ({ logEvent: async () => undefined }));
import { POST } from '@/app/api/master/admin/dispatch/route';
function seed() {
  h.inserts.length = 0;
  h.store.transport_requests = [{ id: 'req-1', status: 'pending', user_id: null }];
  h.store.operators = [
    { id: 'op-1', company_name: 'Synthetic Transport', company_email: 'op1@example.com' },
    { id: 'op-2', company_name: 'Synthetic Transport 2', company_email: 'op2@example.com' },
  ];
  h.store.quotes = []; h.store.unified_profiles = [];
}
function reqFor(quotes: any[]) {
  return new NextRequest('http://localhost/api/master/admin/dispatch', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create_quotes_bulk', requestId: 'req-1', quotes }),
  });
}
describe('admin dispatch create_quotes_bulk vehicleType must be a string', () => {
  beforeEach(seed);
  it('control: string vehicleTypes succeed and are stored verbatim', async () => {
    const res = await POST(reqFor([
      { operatorId: 'op-1', price: 150, vehicleType: 'van' },
      { operatorId: 'op-2', price: 200, vehicleType: 'bus' },
    ]));
    expect(res.status).toBe(200);
    expect(h.inserts.map((p: any) => p.vehicle_type)).toEqual(['van', 'bus']);
  });
  it('attack: numeric vehicleType is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor([{ operatorId: 'op-1', price: 150, vehicleType: 123 }]));
    expect(res.status).toBe(400); expect(h.inserts).toHaveLength(0);
  });
  it('attack: boolean vehicleType is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor([{ operatorId: 'op-1', price: 150, vehicleType: true }]));
    expect(res.status).toBe(400); expect(h.inserts).toHaveLength(0);
  });
  it('attack: array vehicleType is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor([{ operatorId: 'op-1', price: 150, vehicleType: ['van'] }]));
    expect(res.status).toBe(400); expect(h.inserts).toHaveLength(0);
  });
  it('attack: object vehicleType is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor([{ operatorId: 'op-1', price: 150, vehicleType: { type: 'van' } }]));
    expect(res.status).toBe(400); expect(h.inserts).toHaveLength(0);
  });
  it('attack: missing vehicleType is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor([{ operatorId: 'op-1', price: 150 }]));
    expect(res.status).toBe(400); expect(h.inserts).toHaveLength(0);
  });
});
