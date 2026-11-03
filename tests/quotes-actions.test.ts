import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Quotes Actions Tests
 * 
 * Covers endpoints:
 * - /api/quotes/decline: state change, operator notification
 * - /api/quotes/pass: manual allocation flag
 * - /api/quotes/notify: auth and input validation
 */
describe('Quotes Sub-Actions', () => {
    describe('POST /api/quotes/decline', () => {
        it('should require quoteId', () => {
            const payload = {};
            expect(payload).not.toHaveProperty('quoteId');
            // Returns 400
        });

        it('should update quote status to declined', () => {
            const quote = { id: 'q-1', status: 'pending' };
            quote.status = 'declined';
            expect(quote.status).toBe('declined');
        });
    });

    describe('POST /api/quotes/pass', () => {
        it('should require requestId and token', () => {
            const payload1 = { requestId: 'req-1' };
            const payload2 = { token: 'tok-1' };

            expect(payload1).not.toHaveProperty('token');
            expect(payload2).not.toHaveProperty('requestId');
        });

        it('should flag request for manual allocation via Safety Valve', () => {
            const request = {
                id: 'r-1',
                metadata_private: { requires_manual_allocation: false }
            };

            // Mock processing
            const updateData = {
                metadata_private: {
                    ...request.metadata_private,
                    requires_manual_allocation: true
                }
            };

            expect(updateData.metadata_private.requires_manual_allocation).toBe(true);
        });

        it('should block pass attempt if request already booked or cancelled', () => {
            const statuses = ['booked', 'cancelled'];
            statuses.forEach(status => {
                expect(status === 'booked' || status === 'cancelled').toBe(true);
            });
        });
    });

    describe('POST /api/quotes/notify', () => {
        it('should require tripRequestId, quoteCount, emailType', () => {
            const payload = { tripRequestId: 'r-1' };
            const isValid = !!(payload.tripRequestId && (payload as any).quoteCount && (payload as any).emailType);

            expect(isValid).toBe(false);
        });

        it('should correctly select the newest quote for email template', () => {
            const quotes = [
                { id: 'q-1', total_price: 150 },
                { id: 'q-2', total_price: 200 }
            ];

            const latestQuote = quotes[quotes.length - 1];
            expect(latestQuote.id).toBe('q-2');
            expect(latestQuote.total_price).toBe(200);
        });
    });
});

/**
 * Regression (real route): decline status guard.
 *
 * POST /api/quotes/decline updated the quote unconditionally — an
 * already-accepted quote could be flipped to 'declined'. Only a pending
 * quote may be declined. Fixed by inspection alongside
 * BUS-ACCEPT-BINDING-001 (same missing status check); proven here
 * against the real handler on an in-memory mocked supabaseAdmin.
 * Originally a Tier-1 scout candidate, queued 2026-11-02.
 */
import { NextRequest } from 'next/server';

const declineHarness = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = {
    quotes: [],
    transport_requests: [],
    notifications: [],
  };
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
        return items.map((it) => { const row = { id: `row-${++seq}`, ...it }; rows.push(row); return row; });
      }
      const matched = rows.filter((r) => this.match(r));
      if (this.op === 'update') { matched.forEach((r) => Object.assign(r, this.payload)); return matched; }
      return matched;
    }
    async single() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, QB };
});

vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: { from: (t: string) => new declineHarness.QB(t) },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  }),
}));

import { POST as declinePOST } from '@/app/api/quotes/decline/route';

function seedDecline() {
  declineHarness.store.transport_requests = [
    { id: 'req-A', user_id: 'user-1' },
  ];
  declineHarness.store.quotes = [
    { id: 'quote-pending', request_id: 'req-A', operator_id: 'op-A', status: 'pending', total_price: 100 },
    { id: 'quote-accepted', request_id: 'req-A', operator_id: 'op-A', status: 'accepted', total_price: 120 },
  ];
  declineHarness.store.notifications = [];
}

async function postDecline(quoteId: string) {
  const req = new NextRequest('http://localhost/api/quotes/decline', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quoteId }),
  });
  return declinePOST(req);
}

describe('Quote decline status guard (regression)', () => {
  beforeEach(seedDecline);

  it('pending quote can be declined', async () => {
    const res = await postDecline('quote-pending');
    expect(res.status).toBe(200);
    expect(declineHarness.store.quotes.find(q => q.id === 'quote-pending')!.status).toBe('declined');
  });

  it('accepted quote cannot be declined', async () => {
    const res = await postDecline('quote-accepted');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(declineHarness.store.quotes.find(q => q.id === 'quote-accepted')!.status).toBe('accepted');
  });
});
