/**
 * PERMANENT REGRESSION — BUS-DISPATCH-SEND-ADDRESS-SHAPE-001 (converted from the loop probe of cycle 2026-11-24-1252; assertions unchanged)
 * POST /api/master/admin/dispatch action=send (route.ts) builds the
 * operator email with pickupFuzzy: request.pickup_fuzzy || request.pickup_address.split(',')[0]
 * (same for dropoff). If a stored open request has a null pickup/dropoff
 * address and no fuzzy value, this throws an uncaught TypeError; POST has
 * no try/catch. Invariant: a stored request missing its address must fail
 * controlled, send no email, and never throw. Complete request succeeds.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { transport_requests: [], operators: [] };
  const sent: any[] = [];
  class QB {
    table: string; filters: Array<[string, any]> = [];
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    match(r: Row) { return this.filters.every(([k, v]) => r[k] === v); }
    exec() { return (store[this.table] || []).filter((r) => this.match(r)); }
    async single() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }; }
    async maybeSingle() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: null }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, sent, QB };
});
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t) },
  requireAdmin: async () => ({ id: 'admin-1', email: 'admin@example.com' }),
  requireUser: async () => null,
}));
vi.mock('@/lib/email', () => ({
  sendEmail: async (x: any) => { h.sent.push(x); },
  emailTemplates: { operatorNewRequest: (x: any) => ({ subject: 'req', html: 'req' }) },
  getAppBaseUrl: () => 'http://localhost',
}));
vi.mock('@/lib/email-helpers', () => ({ generateOperatorQuoteLink: async () => 'http://localhost/x' }));
vi.mock('@/lib/operator-matching', () => ({ extractRequirements: () => ({}) }));
vi.mock('@/lib/event-logger', () => ({ logEvent: async () => undefined }));
import { POST } from '@/app/api/master/admin/dispatch/route';
const goodReq = { id: 'req-1', status: 'pending', service_type: 'school', pickup_address: '1 Main St, Everett', dropoff_address: '2 Oak St, Boston', pickup_fuzzy: null, dropoff_fuzzy: null, start_date: '2026-12-01', start_time: '08:00', metadata_safe: {} };
function seed(over: Record<string, any> = {}) {
  h.sent.length = 0;
  h.store.transport_requests = [{ ...goodReq, ...over }];
  h.store.operators = [{ id: 'op-1', company_name: 'Synthetic Transport', company_email: 'op@example.com', is_partner: false }];
}
function reqFor() {
  return new NextRequest('http://localhost/api/master/admin/dispatch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'send', requestId: 'req-1', operatorId: 'op-1' }) });
}
describe('admin dispatch send stored-address shape', () => {
  beforeEach(() => seed());
  it('control: complete open request sends one email', async () => {
    const res = await POST(reqFor());
    expect(res.status).toBe(200);
    expect(h.sent).toHaveLength(1);
  });
  it('attack: null pickup_address fails controlled, no email', async () => {
    seed({ pickup_address: null });
    const res = await POST(reqFor());
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.sent).toHaveLength(0);
  });
  it('attack: null dropoff_address fails controlled, no email', async () => {
    seed({ dropoff_address: null });
    const res = await POST(reqFor());
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.sent).toHaveLength(0);
  });
});
