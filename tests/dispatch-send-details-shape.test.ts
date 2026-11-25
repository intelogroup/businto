/**
 * PERMANENT REGRESSION — BUS-DISPATCH-SEND-DETAILS-SHAPE-001 (converted from the loop probe of cycle 2026-11-24-0052; assertions unchanged)
 * POST /api/master/admin/dispatch action=send_operator_details
 * (src/app/api/master/admin/dispatch/route.ts:507) fetches a booking
 * pending manual PII exchange with joined transport_requests /
 * operators / quotes, then dereferences request.pickup_address and
 * operator.company_email with no null check and no try/catch in POST.
 * Invariant: a booking whose joined request or operator row is missing
 * (deleted after booking) must fail with a controlled response, send
 * no email, and leave requires_manual_exchange=true — never throw an
 * uncaught TypeError. A complete booking succeeds exactly once.
 * Harness: in-memory mocked Supabase; synthetic admin/booking/operator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { bookings: [], unified_profiles: [] };
  const sent: any[] = [];
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    match(r: Row) { return this.filters.every(([k, v]) => r[k] === v); }
    exec() {
      const rows = store[this.table] || (store[this.table] = []);
      if (this.op === 'update') { const m = rows.filter((r) => this.match(r)); m.forEach((r) => Object.assign(r, this.payload)); return m; }
      return rows.filter((r) => this.match(r));
    }
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
  emailTemplates: { operatorOrderDetails: (x: any) => ({ subject: 'details', html: 'details' }) },
  getAppBaseUrl: () => 'http://localhost',
}));
vi.mock('@/lib/email-helpers', () => ({ generateOperatorQuoteLink: async () => 'http://localhost/x' }));
vi.mock('@/lib/operator-matching', () => ({ extractRequirements: () => ({}) }));
vi.mock('@/lib/event-logger', () => ({ logEvent: async () => undefined }));

import { POST } from '@/app/api/master/admin/dispatch/route';

const goodRequest = { service_type: 'school', pickup_address: '1 Main St', dropoff_address: '2 Oak St', start_date: '2026-12-01', start_time: '08:00', metadata_private: { parent_name: 'Synthetic Parent', parent_email: 'p@example.com', parent_phone: '555-0100' } };
const goodOperator = { company_name: 'Synthetic Transport', company_email: 'op@example.com' };

function seed(over: Record<string, any> = {}) {
  h.sent.length = 0;
  h.store.bookings = [{
    id: 'bk-1', confirmation_code: 'CONF1', amount: 150, request_id: 'req-1',
    operator_id: 'op-1', user_id: 'user-1', requires_manual_exchange: true,
    transport_requests: goodRequest, operators: goodOperator, quotes: { vehicle_type: 'van' },
    ...over,
  }];
  h.store.unified_profiles = [{ id: 'user-1', full_name: 'Synthetic Parent', email: 'p@example.com', phone: '555-0100' }];
}
function reqFor() {
  return new NextRequest('http://localhost/api/master/admin/dispatch', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'send_operator_details', bookingId: 'bk-1' }),
  });
}

describe('admin dispatch send_operator_details joined-row shape', () => {
  beforeEach(() => seed());
  it('control: complete booking sends one email and clears the exchange flag', async () => {
    const res = await POST(reqFor());
    expect(res.status).toBe(200);
    expect(h.sent).toHaveLength(1);
    expect(h.store.bookings[0].requires_manual_exchange).toBe(false);
  });
  it('attack: missing joined transport_requests fails controlled, no email, flag stays', async () => {
    seed({ transport_requests: null });
    const res = await POST(reqFor());
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.sent).toHaveLength(0);
    expect(h.store.bookings[0].requires_manual_exchange).toBe(true);
  });
  it('attack: missing joined operators fails controlled, no email, flag stays', async () => {
    seed({ operators: null });
    const res = await POST(reqFor());
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.sent).toHaveLength(0);
    expect(h.store.bookings[0].requires_manual_exchange).toBe(true);
  });
});
