/**
 * PERMANENT REGRESSION — BUS-PASS-CLOSED-REQUEST-001 (adversarial-loop probe cycle 2026-11-04-0952; fixed 2026-11-04)
 * Scenario: operator PASS on a closed transport request.
 * POST /api/quotes/pass flags a request for admin re-dispatch (Safety Valve).
 * It refuses booked and cancelled requests ("no longer active", 409) but
 * never refuses a COMPLETED request — third surface in the quotes
 * request-lifecycle family (BUS-QUOTE-CLOSED-REQUEST-001 submission,
 * BUS-ACCEPT-CLOSED-REQUEST-001 acceptance).
 *
 * Invariant: an operator pass may flag only an active request; a completed
 * request is not flagged requires_manual_allocation and creates no
 * re-dispatch work.
 * Harness: in-memory fake supabaseAdmin (repo pattern), operator-token
 * verifier mocked to accept one synthetic token per request.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { transport_requests: [] };
  class QB {
    table: string; op = 'select'; filters: Array<[string, any]> = []; payload: any = null;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    exec() {
      const rows = store[this.table];
      const matched = rows.filter((r) => this.filters.every(([k, v]) => r[k] === v));
      if (this.op === 'update') { matched.forEach((r) => Object.assign(r, this.payload)); return matched; }
      return matched;
    }
    async single() { const r = this.exec(); return r.length ? { data: r[0], error: null } : { data: null, error: { message: 'not found' } }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB };
});

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (t: string) => new h.QB(t) } }));
vi.mock('@/lib/tokens', () => ({
  verifyOperatorViewToken: vi.fn(async (token: string) => {
    // token format: tok-<requestId>
    if (!token.startsWith('tok-')) return null;
    return { requestId: token.slice(4), operatorId: 'op-A' };
  }),
}));
vi.mock('@/lib/event-logger', () => ({ logEvent: vi.fn(async () => {}) }));

import { POST } from '@/app/api/quotes/pass/route';

function seed() {
  h.store.transport_requests = [
    { id: 'req-open', status: 'pending', metadata_private: {} },
    { id: 'req-booked', status: 'booked', metadata_private: {} },
    { id: 'req-cancelled', status: 'cancelled', metadata_private: {} },
    { id: 'req-completed', status: 'completed', metadata_private: {} },
  ];
}
function pass(requestId: string) {
  const req = new NextRequest('http://localhost/api/quotes/pass', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId, token: `tok-${requestId}` }),
  });
  return POST(req);
}
const flagged = (id: string) => (h.store.transport_requests.find((r) => r.id === id)!.metadata_private as any)?.requires_manual_allocation === true;

describe('operator pass on closed request probe', () => {
  beforeEach(seed);
  it('control: pass on OPEN (pending) request -> 200, flagged for re-dispatch', async () => {
    const res = await pass('req-open');
    expect(res.status).toBe(200);
    expect(flagged('req-open')).toBe(true);
  });
  it('sanity: pass on BOOKED request -> refused, not flagged (existing guard)', async () => {
    const res = await pass('req-booked');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(flagged('req-booked')).toBe(false);
  });
  it('sanity: pass on CANCELLED request -> refused, not flagged (existing guard)', async () => {
    const res = await pass('req-cancelled');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(flagged('req-cancelled')).toBe(false);
  });
  it('attack: pass on COMPLETED request -> refused, not flagged for re-dispatch', async () => {
    const res = await pass('req-completed');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(flagged('req-completed')).toBe(false);
  });
});
