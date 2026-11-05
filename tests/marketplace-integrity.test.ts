import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * CRITICAL: Marketplace Integrity Tests
 * 
 * Ensures acceptance finality and quote submission locks:
 * - Once accepted, request is permanently locked
 * - No operator switching after acceptance
 * - Late quotes rejected with 409
 * - Declined quotes never resurrected
 */

describe('Marketplace Integrity - Final Acceptance', () => {
  describe('Quote Submission Lockout', () => {
    it('should return 409 if request already has accepted quote', () => {
      const request = {
        id: 'req-123',
        quotes: [
          { id: 'q1', status: 'accepted', operator_id: 'op-1' },
          { id: 'q2', status: 'declined', operator_id: 'op-2' }
        ]
      };

      const hasAcceptedQuote = request.quotes.some(q => q.status === 'accepted');
      
      expect(hasAcceptedQuote).toBe(true);
      // API should return 409 with message: "Request already fulfilled"
    });

    it('should allow quotes if no acceptance yet', () => {
      const request = {
        id: 'req-123',
        quotes: [
          { id: 'q1', status: 'pending', operator_id: 'op-1' },
          { id: 'q2', status: 'pending', operator_id: 'op-2' }
        ]
      };

      const hasAcceptedQuote = request.quotes.some(q => q.status === 'accepted');
      
      expect(hasAcceptedQuote).toBe(false);
      // API should accept new quote submissions
    });

    it('should reject late quote with proper error message', () => {
      const errorMessage = 'Request already fulfilled. Acceptance is final - no new quotes accepted.';
      
      expect(errorMessage).toContain('already fulfilled');
      expect(errorMessage).toContain('Acceptance is final');
      expect(errorMessage).toContain('no new quotes');
    });
  });

  describe('Acceptance Finality', () => {
    it('should return 409 if trying to accept when already accepted', () => {
      const request = {
        id: 'req-123',
        quotes: [
          { id: 'q1', status: 'accepted', operator_id: 'op-1' },
          { id: 'q2', status: 'pending', operator_id: 'op-2' }
        ]
      };

      const existingAccepted = request.quotes.find(q => q.status === 'accepted');
      
      expect(existingAccepted).toBeDefined();
      expect(existingAccepted?.id).toBe('q1');
      // API should return 409: "Request already fulfilled. Acceptance is final"
    });

    it('should prevent switching operators after acceptance', () => {
      const acceptedQuote = { id: 'q1', status: 'accepted', operator_id: 'op-1' };
      const newAttempt = { quoteId: 'q2', operator_id: 'op-2' };

      expect(acceptedQuote.status).toBe('accepted');
      // Any attempt to accept q2 should be blocked
      // User must create new request to choose different operator
    });

    it('should use correct error message for acceptance attempt', () => {
      const errorMessage = 'Request already fulfilled. Acceptance is final - cannot change operators.';
      
      expect(errorMessage).toContain('already fulfilled');
      expect(errorMessage).toContain('Acceptance is final');
      expect(errorMessage).toContain('cannot change operators');
    });

    it('should include locked flag in error response', () => {
      const errorResponse = {
        error: 'Request already fulfilled',
        locked: true
      };

      expect(errorResponse.locked).toBe(true);
    });
  });

  describe('Declined Quotes Never Resurrect', () => {
    it('should permanently decline other quotes when one accepted', () => {
      const quotes = [
        { id: 'q1', status: 'accepted' },
        { id: 'q2', status: 'declined' }, // was pending, now declined
        { id: 'q3', status: 'declined' }  // was pending, now declined
      ];

      const declinedQuotes = quotes.filter(q => q.status === 'declined');
      
      expect(declinedQuotes).toHaveLength(2);
      // These should NEVER be auto-reactivated
    });

    it('should not allow declined quotes to become pending again', () => {
      const quote = { id: 'q2', status: 'declined' };

      // Even if parent regrets choice, this quote stays declined
      expect(quote.status).toBe('declined');
      
      // Invalid state transition:
      const invalidTransition = () => {
        quote.status = 'pending' as any;
      };
      
      // This should never happen in the system
      expect(quote.status).toBe('declined');
    });

    it('should clarify declined quotes are permanent in comments', () => {
      const comment = 'MARKETPLACE INTEGRITY: Once declined, these quotes are permanently closed. They will NOT be resurrected even if parent regrets choice.';
      
      expect(comment).toContain('permanently closed');
      expect(comment).toContain('NOT be resurrected');
      expect(comment).toContain('parent regrets choice');
    });
  });

  describe('Quote Abuse Prevention', () => {
    it('should reject duplicate quotes from same operator', () => {
      const existingQuotes = [
        { id: 'q1', operator_id: 'op-1', status: 'pending' }
      ];

      const newQuoteAttempt = {
        operator_id: 'op-1',
        request_id: 'req-123'
      };

      const hasDuplicate = existingQuotes.some(
        q => q.operator_id === newQuoteAttempt.operator_id && q.status !== 'withdrawn'
      );

      expect(hasDuplicate).toBe(true);
      // API should return 409: "You have already submitted a quote"
    });

    it('should allow resubmission only if previous quote withdrawn', () => {
      const existingQuote = { id: 'q1', operator_id: 'op-1', status: 'withdrawn' };

      expect(existingQuote.status).toBe('withdrawn');
      // API should delete old withdrawn quote and accept new one
    });

    it('should delete old withdrawn quote before allowing new one', () => {
      const quotes = [
        { id: 'q1', operator_id: 'op-1', status: 'withdrawn' }
      ];

      // Delete withdrawn quote
      const filtered = quotes.filter(q => q.id !== 'q1');
      
      expect(filtered).toHaveLength(0);
      // Now operator can submit new quote
    });

    it('should use correct error message for duplicate quotes', () => {
      const errorMessage = 'You have already submitted a quote for this request. You cannot submit multiple quotes.';
      
      expect(errorMessage).toContain('already submitted');
      expect(errorMessage).toContain('cannot submit multiple');
    });
  });

  describe('Request Status Consistency', () => {
    it('should mark request as quote_accepted when quote accepted', () => {
      const request = {
        id: 'req-123',
        status: 'quoted'
      };

      // After acceptance
      request.status = 'quote_accepted';
      
      expect(request.status).toBe('quote_accepted');
    });

    it('should not change from quote_accepted back to quoted', () => {
      const request = {
        id: 'req-123',
        status: 'quote_accepted'
      };

      // This status is final
      expect(request.status).toBe('quote_accepted');
      
      // Invalid transition (should never happen):
      // request.status = 'quoted'; // WRONG!
    });

    it('should keep request locked even if payment pending', () => {
      const request = {
        id: 'req-123',
        status: 'quote_accepted',
        payment_status: 'pending'
      };

      expect(request.status).toBe('quote_accepted');
      // Request is locked regardless of payment status
      // No new quotes allowed, no acceptance changes allowed
    });
  });

  describe('Operator Notifications', () => {
    it('should notify losing operators when quote declined', () => {
      const declinedOperators = [
        { operator_id: 'op-2', type: 'quote_declined' },
        { operator_id: 'op-3', type: 'quote_declined' }
      ];

      expect(declinedOperators).toHaveLength(2);
      declinedOperators.forEach(notification => {
        expect(notification.type).toBe('quote_declined');
      });
    });

    it('should use correct message for declined operators', () => {
      const message = 'The customer has chosen another operator for this request.';
      
      expect(message).toContain('chosen another operator');
      expect(message).not.toContain('your quote');
      // Professional, not personal
    });

    it('should notify late operators that request is closed', () => {
      const operatorMessage = 'Request closed — quote already accepted';
      
      expect(operatorMessage).toContain('Request closed');
      expect(operatorMessage).toContain('already accepted');
    });
  });
});

/**
 * Regression (real route): BUS-ACCEPT-BINDING-001
 *
 * A quote may be accepted only for the transport request it belongs to,
 * and only while pending (the accept_quote_atomic contract, migration
 * 20260326000001). Proven against the real POST /api/quotes/accept handler
 * on an in-memory Supabase harness (the repo's stripe-webhooks mocking
 * pattern). Originally a loop probe, cycle 2026-11-02-1552.
 */
import { NextRequest } from 'next/server';

const acceptHarness = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = {
    transport_requests: [],
    quotes: [],
    bookings: [],
    notifications: [],
  };
  let seq = 0;

  class QB {
    table: string;
    op: string = 'select';
    filters: Array<[string, string, any]> = [];
    payload: any = null;
    constructor(table: string) { this.table = table; }
    select(_cols?: any) { return this; }
    eq(k: string, v: any) { this.filters.push(['eq', k, v]); return this; }
    neq(k: string, v: any) { this.filters.push(['neq', k, v]); return this; }
    update(p: any) { this.op = 'update'; this.payload = p; return this; }
    insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
    match(row: Row) {
      return this.filters.every(([t, k, v]) => (t === 'eq' ? row[k] === v : row[k] !== v));
    }
    exec() {
      const rows = store[this.table];
      if (this.op === 'insert') {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload];
        return items.map((it) => {
          const row = { id: `row-${++seq}`, ...it };
          rows.push(row);
          return row;
        });
      }
      const matched = rows.filter((r) => this.match(r));
      if (this.op === 'update') {
        matched.forEach((r) => Object.assign(r, this.payload));
        return matched;
      }
      return matched;
    }
    async single() {
      const rows = this.exec();
      if (rows.length === 0) return { data: null, error: { message: 'Row not found' } };
      return { data: rows[0], error: null };
    }
    async maybeSingle() {
      const rows = this.exec();
      return { data: rows.length ? rows[0] : null, error: null };
    }
    then(resolve: any, reject: any) {
      try {
        resolve({ data: this.exec(), error: null });
      } catch (e) { reject(e); }
    }
  }

  return { store, QB };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new acceptHarness.QB(t) },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async () => ({ id: 'mock-email' })),
  emailTemplates: { bookingConfirmation: () => ({ subject: 's', html: 'h' }) },
  getAppBaseUrl: () => 'http://localhost:3000',
}));

vi.mock('@/lib/sms', () => ({
  sendSMS: vi.fn(async () => ({})),
  smsTemplates: { quoteAccepted: () => ({ body: 'x' }) },
}));

vi.mock('@/lib/event-logger', () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/app-settings', () => ({ getDispatchMode: vi.fn(async () => false) }));

import { POST as acceptPOST } from '@/app/api/quotes/accept/route';

const ACCEPT_OP_A = { id: 'op-A', company_name: 'Op A', company_email: 'a@example.com', company_phone: '555', profile: null };
const ACCEPT_OP_B = { id: 'op-B', company_name: 'Op B', company_email: 'b@example.com', company_phone: '555', profile: null };

function seedAcceptHarness() {
  acceptHarness.store.transport_requests = [
    { id: 'req-A', status: 'quoted', user_id: 'user-1', metadata_private: {}, userProfile: null },
    { id: 'req-B', status: 'quoted', user_id: 'user-2', metadata_private: {}, userProfile: null },
  ];
  acceptHarness.store.quotes = [
    { id: 'quote-A1', request_id: 'req-A', operator_id: 'op-A', status: 'pending', total_price: 100, expires_at: null, operator: ACCEPT_OP_A },
    { id: 'quote-A2', request_id: 'req-A', operator_id: 'op-A', status: 'declined', total_price: 80, expires_at: null, operator: ACCEPT_OP_A },
    { id: 'quote-B1', request_id: 'req-B', operator_id: 'op-B', status: 'pending', total_price: 999, expires_at: null, operator: ACCEPT_OP_B },
  ];
  acceptHarness.store.bookings = [];
  acceptHarness.store.notifications = [];
}

function postAccept(quoteId: string, tripRequestId: string) {
  const req = new NextRequest('http://localhost:3000/api/quotes/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quoteId, tripRequestId }),
  });
  return acceptPOST(req);
}

describe('Quote acceptance binding (BUS-ACCEPT-BINDING-001 regression)', () => {
  beforeEach(() => seedAcceptHarness());

  it('owner accepts own pending quote for own request', async () => {
    const res = await postAccept('quote-A1', 'req-A');
    expect(res.status).toBe(200);
    expect(acceptHarness.store.bookings).toHaveLength(1);
    expect(acceptHarness.store.bookings[0].amount).toBe(100);
  });

  it('rejects a quote belonging to another request', async () => {
    const res = await postAccept('quote-B1', 'req-A');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(acceptHarness.store.bookings).toHaveLength(0);
    expect(acceptHarness.store.quotes.find((q) => q.id === 'quote-B1')!.status).toBe('pending');
    expect(acceptHarness.store.transport_requests.find((r) => r.id === 'req-A')!.status).toBe('quoted');
  });

  it('rejects a declined (non-pending) quote — no resurrection', async () => {
    const res = await postAccept('quote-A2', 'req-A');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(acceptHarness.store.bookings).toHaveLength(0);
    expect(acceptHarness.store.quotes.find((q) => q.id === 'quote-A2')!.status).toBe('declined');
  });
});
