/**
 * REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-08-1852; Phase 1 write core (src/lib/transitions.ts) — Businto
 * Scenario: quote DECLINE racing quote ACCEPTANCE on the same quote.
 * POST /api/quotes/decline reads the quote, refuses unless it is 'pending',
 * then UPDATEs with a status predicate (.eq('status','pending')) — but it
 * never checks how many rows that update touched, and it unconditionally
 * inserts a 'quote_declined' notification and returns 200 afterwards.
 * If the rider's accept (a second tab / the token flow) lands between the
 * decline's read and its write, the predicated update correctly matches
 * 0 rows, yet the route still reports success and tells the operator their
 * now-ACCEPTED (booked) quote was declined.
 *
 * Invariant: a decline that did not transition the quote must not report
 * success and must not emit a quote_declined notification; an accepted
 * quote stays accepted and its operator receives no decline notice.
 * Harness: in-memory fake supabase; the interleaved acceptance is applied
 * at the moment the decline's update executes (inside the read->write
 * window), exactly as the real DB predicate would see it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { quotes: [], transport_requests: [], notifications: [] };
  let seq = 0;
  let interleaveAccept = false;
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
      if (this.op === 'update') {
        if (interleaveAccept && this.table === 'quotes') {
          // The competing accept lands first, inside the window: the quote
          // leaves 'pending' before this update's predicate is evaluated.
          const q = rows.find((r) => r.id === 'q-1');
          if (q) q.status = 'accepted';
          interleaveAccept = false;
          const rematched = rows.filter((r) => this.match(r));
          rematched.forEach((r) => Object.assign(r, this.payload));
          return rematched;
        }
        matched.forEach((r) => Object.assign(r, this.payload));
        return matched;
      }
      return matched;
    }
    async single() { const r = this.exec(); return r.length ? { data: r[0], error: null } : { data: null, error: { message: 'not found' } }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB, setInterleave: (v: boolean) => { interleaveAccept = v; } };
});

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (t: string) => new h.QB(t) } }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } }),
}));

import { POST } from '@/app/api/quotes/decline/route';

function seed() {
  h.setInterleave(false);
  h.store.transport_requests = [{ id: 'req-1', user_id: 'user-1', status: 'quoted' }];
  h.store.quotes = [{ id: 'q-1', request_id: 'req-1', operator_id: 'op-A', status: 'pending', total_price: 100 }];
  h.store.notifications = [];
}
function decline(quoteId: string) {
  const req = new NextRequest('http://localhost/api/quotes/decline', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quoteId }) });
  return POST(req);
}

describe('quote decline vs accept race (0-row predicated write ignored)', () => {
  beforeEach(seed);
  it('control: decline of a pending quote -> 200, quote declined, one notification', async () => {
    const res = await decline('q-1');
    expect(res.status).toBe(200);
    expect(h.store.quotes[0].status).toBe('declined');
    expect(h.store.notifications).toHaveLength(1);
  });
  it('control: sequential decline of an already-accepted quote -> 409, no notification', async () => {
    h.store.quotes[0].status = 'accepted';
    const res = await decline('q-1');
    expect(res.status).toBe(409);
    expect(h.store.quotes[0].status).toBe('accepted');
    expect(h.store.notifications).toHaveLength(0);
  });
  it('attack: accept lands between decline read and write -> decline must not succeed or notify', async () => {
    h.setInterleave(true);
    const res = await decline('q-1');
    expect(h.store.quotes[0].status).toBe('accepted');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.store.notifications).toHaveLength(0);
  });
});
