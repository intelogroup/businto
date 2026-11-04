/**
 * PERMANENT REGRESSION — BUS-QUOTE-CLOSED-REQUEST-001 (adversarial-loop probe cycle 2026-11-04-0352; fixed 2026-11-04)
 * Scenario: quote SUBMISSION on a closed transport request.
 * POST /api/quotes verifies the operator token, purpose, duplicate and
 * accepted-quote lock, but never reads the transport request's own status.
 *
 * Invariant: a quote may be submitted only on an open request (pending /
 * quoted). A cancelled or completed request accepts no new quote, creates
 * no quote row, and triggers no rider email/notification.
 *
 * Harness: in-memory fake of the supabaseAdmin chain (repo pattern), REAL
 * operator tokens via generateOperatorViewToken (dummy JWT secret),
 * sendEmail mocked. Synthetic operators/requests only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const OP = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const REQ_OPEN = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const REQ_CANCELLED = 'c3d4e5f6-a7b8-4c9d-ae1f-2a3b4c5d6e7f';
const REQ_COMPLETED = 'd4e5f6a7-b8c9-4d0e-bf2a-3b4c5d6e7f8a';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = {
    transport_requests: [], quotes: [], notifications: [], operators: [], operator_profiles: [],
  };
  let seq = 0;
  const sendEmail = vi.fn().mockResolvedValue({ id: 'mock-email' });
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null; done: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
    delete() { this.op = 'delete'; return this; }
    exec() {
      if (this.done) return this.done;
      const rows = store[this.table];
      const matched = rows.filter((r) => this.filters.every(([k, v]) => r[k] === v));
      if (this.op === 'insert') {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload];
        this.done = items.map((it) => { const row = { id: `row-${++seq}`, ...it }; rows.push(row); return row; });
      } else if (this.op === 'update') { matched.forEach((r) => Object.assign(r, this.payload)); this.done = matched; }
      else if (this.op === 'delete') { this.done = []; }
      else this.done = matched;
      return this.done;
    }
    async single() { const r = this.exec(); return r.length ? { data: r[0], error: null } : { data: null, error: { message: 'Row not found' } }; }
    async maybeSingle() { const r = this.exec(); return { data: r.length ? r[0] : null, error: null }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB, sendEmail };
});

vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: { from: (t: string) => new h.QB(t) } }));
vi.mock('@/lib/event-logger', () => ({ logEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/email', () => ({
  sendEmail: h.sendEmail,
  emailTemplates: { quoteReceived: vi.fn().mockReturnValue({ subject: 'Quote', html: '<p>Q</p>' }) },
  getAppBaseUrl: vi.fn().mockReturnValue('http://localhost'),
}));
vi.mock('@/lib/email-helpers', () => ({ generateTripViewLink: vi.fn().mockResolvedValue('http://localhost/trips/view?token=x') }));

import { POST } from '@/app/api/quotes/route';
import { generateOperatorViewToken } from '@/lib/tokens';

function seed() {
  h.store.transport_requests = [
    { id: REQ_OPEN, user_id: 'user-1', status: 'pending', metadata_private: {}, userProfile: { email: 'rider@example.test', full_name: 'Rider One' } },
    { id: REQ_CANCELLED, user_id: 'user-1', status: 'cancelled', metadata_private: {}, userProfile: { email: 'rider@example.test', full_name: 'Rider One' } },
    { id: REQ_COMPLETED, user_id: 'user-1', status: 'completed', metadata_private: {}, userProfile: { email: 'rider@example.test', full_name: 'Rider One' } },
  ];
  h.store.quotes = [];
  h.store.notifications = [];
  h.store.operators = [{ id: OP, company_name: 'Synthetic Transport Co', company_phone: '555-0100' }];
  h.store.operator_profiles = [];
  h.sendEmail.mockClear();
}

async function submit(requestId: string) {
  const token = await generateOperatorViewToken(requestId, OP, 'quote');
  const req = new NextRequest('http://localhost/api/quotes', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, request_id: requestId, operator_id: OP, total_price: 100, vehicle_type: 'Van' }),
  });
  return POST(req);
}
const quotesFor = (rid: string) => h.store.quotes.filter((q) => q.request_id === rid);

describe('quote submission on closed request probe', () => {
  beforeEach(seed);

  it('control: quote on OPEN (pending) request -> 200, one quote row', async () => {
    const res = await submit(REQ_OPEN);
    expect(res.status).toBe(200);
    expect(quotesFor(REQ_OPEN).length).toBe(1);
  });

  it('attack 1: quote on CANCELLED request -> refused, no quote row, no notification, no email', async () => {
    const res = await submit(REQ_CANCELLED);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(quotesFor(REQ_CANCELLED).length).toBe(0);
    expect(h.store.notifications.length).toBe(0);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('attack 2: quote on COMPLETED request -> refused, no quote row, no notification, no email', async () => {
    const res = await submit(REQ_COMPLETED);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(quotesFor(REQ_COMPLETED).length).toBe(0);
    expect(h.store.notifications.length).toBe(0);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
});
