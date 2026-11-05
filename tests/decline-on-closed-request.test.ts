/**
 * PERMANENT REGRESSION — BUS-DECLINE-CLOSED-REQUEST-001 (adversarial-loop probe cycle 2026-11-04-1852, repeated through 2026-11-05-0652; fixed 2026-11-05)
 * Scenario: quote DECLINE on a closed transport request.
 * POST /api/quotes/decline verifies ownership and that the QUOTE is
 * pending, but never read the transport request's status (it selected
 * only user_id). The 2026-11-04 fix landed a shared open-status guard
 * (src/lib/request-status.ts) for submission (token + dashboard),
 * acceptance, and pass — decline was a remaining quote-family action
 * not covered by it. The route now applies isOpenRequestStatus to the
 * request row it already fetches.
 *
 * Invariant: a quote-family action may act only on an OPEN request
 * (pending/quoted); declining a quote on a cancelled or completed
 * request must be refused, with no quote mutation and no operator
 * notification.
 * Harness: in-memory fake supabase (repo quotes-actions pattern),
 * session auth user-1.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { quotes: [], transport_requests: [], notifications: [] };
  let seq = 0;
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
    match(r: Row) { return this.filters.every(([k, v]) => r[k] === v); }
    exec() {
      const rows = store[this.table];
      if (this.op === 'insert') {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload];
        return items.map((it: any) => { const row = { id: `row-${++seq}`, ...it }; rows.push(row); return row; });
      }
      const matched = rows.filter((r) => this.match(r));
      if (this.op === 'update') { matched.forEach((r) => Object.assign(r, this.payload)); return matched; }
      return matched;
    }
    async single() { const r = this.exec(); return r.length ? { data: r[0], error: null } : { data: null, error: { message: 'not found' } }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB };
});

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (t: string) => new h.QB(t) } }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } }),
}));

import { POST } from '@/app/api/quotes/decline/route';

function seed() {
  h.store.transport_requests = [
    { id: 'req-open', user_id: 'user-1', status: 'quoted' },
    { id: 'req-cancelled', user_id: 'user-1', status: 'cancelled' },
    { id: 'req-completed', user_id: 'user-1', status: 'completed' },
  ];
  h.store.quotes = [
    { id: 'q-open', request_id: 'req-open', operator_id: 'op-A', status: 'pending', total_price: 100 },
    { id: 'q-cancelled', request_id: 'req-cancelled', operator_id: 'op-A', status: 'pending', total_price: 100 },
    { id: 'q-completed', request_id: 'req-completed', operator_id: 'op-A', status: 'pending', total_price: 100 },
  ];
  h.store.notifications = [];
}
function decline(quoteId: string) {
  const req = new NextRequest('http://localhost/api/quotes/decline', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quoteId }) });
  return POST(req);
}

describe('quote decline on closed request (regression)', () => {
  beforeEach(seed);
  it('control: decline pending quote on OPEN (quoted) request -> 200, quote declined, one operator notification', async () => {
    const res = await decline('q-open');
    expect(res.status).toBe(200);
    expect(h.store.quotes.find(q => q.id === 'q-open')!.status).toBe('declined');
    expect(h.store.notifications).toHaveLength(1);
  });
  it('attack 1: decline on CANCELLED request -> refused, quote stays pending, no notification', async () => {
    const res = await decline('q-cancelled');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.store.quotes.find(q => q.id === 'q-cancelled')!.status).toBe('pending');
    expect(h.store.notifications).toHaveLength(0);
  });
  it('attack 2: decline on COMPLETED request -> refused, quote stays pending, no notification', async () => {
    const res = await decline('q-completed');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.store.quotes.find(q => q.id === 'q-completed')!.status).toBe('pending');
    expect(h.store.notifications).toHaveLength(0);
  });
});
