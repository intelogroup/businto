/**
 * PERMANENT REGRESSION — BUS-DISPATCH-QUOTE-VEHICLE-SHAPE-001 (converted from the loop probe of cycle 2026-11-19-1852; assertions unchanged)
 * POST /api/master/admin/dispatch action=create_quote: vehicleType is
 * guarded only by truthiness, then inserted verbatim as quotes.vehicle_type
 * and passed to the quote email template.
 * Invariant: vehicle_type must be a non-empty string; any non-string shape
 * is refused 400 before any insert, while a genuine string succeeds.
 * Harness: in-memory mocked Supabase; synthetic admin/request/operator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { transport_requests: [], operators: [], quotes: [], unified_profiles: [] };
  const inserts: any[] = [];
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; inserts.push(p); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    match(r: Row) { return this.filters.every(([k, v]) => r[k] === v); }
    exec() {
      const rows = store[this.table] || (store[this.table] = []);
      if (this.op === 'insert') { const m = { id: 'quote-1', ...this.payload }; rows.push(m); return [m]; }
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
  h.store.operators = [{ id: 'op-1', company_name: 'Synthetic Transport', company_email: 'op@example.com' }];
  h.store.quotes = []; h.store.unified_profiles = [];
}
function reqFor(vehicleType: any) {
  return new NextRequest('http://localhost/api/master/admin/dispatch', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create_quote', requestId: 'req-1', operatorId: 'op-1', price: 150, vehicleType }),
  });
}
describe('admin dispatch create_quote vehicleType must be a string', () => {
  beforeEach(seed);
  it('control: string vehicleType succeeds and is stored verbatim', async () => {
    const res = await POST(reqFor('van'));
    expect(res.status).toBe(200);
    expect(h.inserts.map((p: any) => p.vehicle_type)).toEqual(['van']);
  });
  it('attack: numeric vehicleType is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor(123));
    expect(res.status).toBe(400); expect(h.inserts).toHaveLength(0);
  });
  it('attack: boolean vehicleType is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor(true));
    expect(res.status).toBe(400); expect(h.inserts).toHaveLength(0);
  });
  it('attack: array vehicleType is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor(['van']));
    expect(res.status).toBe(400); expect(h.inserts).toHaveLength(0);
  });
  it('attack: object vehicleType is refused 400 and inserts nothing', async () => {
    const res = await POST(reqFor({ type: 'van' }));
    expect(res.status).toBe(400); expect(h.inserts).toHaveLength(0);
  });
});
