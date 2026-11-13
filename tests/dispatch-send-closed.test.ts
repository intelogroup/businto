/**
 * PERMANENT REGRESSION — BUS-DISPATCH-SEND-CLOSED-001 (converted from the loop probe of cycle 2026-11-12-1252; assertions unchanged)
 * POST /api/master/admin/dispatch actions 'send' and 'create_and_send'
 * fetch the transport request by id and immediately email an operator a
 * claim/quote link, never reading request.status. Their sibling branches
 * in the SAME file ('create_quote', 'create_quotes_bulk') refuse
 * booked/completed/canceled/cancelled requests with 400 before any work.
 * Invariant: a manual dispatch email may be sent only for an open
 * (pending/quoted) request; a closed request is refused before any
 * email / claim-link generation, on both dispatch branches.
 * Harness: in-memory mocked Supabase returning a synthetic request whose
 * status is set per test + a synthetic operator; mocked email transport
 * records every send. Admin gate satisfied by the mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  const state = { status: 'pending' as string };
  const emails: any[] = [];
  const claimLinks: number[] = [];
  const operator = { id: 'op-1', company_name: 'Synthetic Co', company_email: 'op@synthetic.test', is_partner: false };
  function requestRow() {
    return {
      id: 'req-1', user_id: 'user-1', status: state.status, service_type: 'school',
      pickup_address: '1 Main St, Everett, MA', dropoff_address: '2 Oak St, Boston, MA',
      pickup_fuzzy: 'Everett', dropoff_fuzzy: 'Boston',
      start_date: '2026-12-01', start_time: '08:00', metadata_safe: {}, metadata_private: {},
    };
  }
  class QB {
    table: string;
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq() { return this; }
    order() { return this; }
    async single() {
      if (this.table === 'transport_requests') return { data: requestRow(), error: null };
      if (this.table === 'operators') return { data: operator, error: null };
      return { data: null, error: null };
    }
    async maybeSingle() {
      if (this.table === 'operators') return { data: operator, error: null };
      return { data: null, error: null };
    }
    then(res: any) { res({ data: null, error: null }); }
  }
  return { state, emails, claimLinks, QB, operator };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB(t), auth: { admin: { createUser: async () => ({ data: { user: { id: 'x' } }, error: null }) } } },
  requireAdmin: async () => ({ id: 'admin-1', email: 'admin@synthetic.test' }),
}));
vi.mock('@/lib/email', () => ({
  sendEmail: async (m: any) => { h.emails.push(m); return {}; },
  emailTemplates: { operatorNewRequest: () => ({}), adminDispatchedNotification: () => ({}), quoteReceived: () => ({}), quotesBulkReceived: () => ({}), operatorOrderDetails: () => ({}) },
  getAppBaseUrl: () => 'http://localhost',
}));
vi.mock('@/lib/email-helpers', () => ({ generateOperatorQuoteLink: async () => { h.claimLinks.push(1); return 'http://localhost/x'; } }));
vi.mock('@/lib/operator-matching', () => ({ extractRequirements: () => [] }));
vi.mock('@/lib/event-logger', () => ({ logEvent: async () => {} }));

import { POST } from '@/app/api/master/admin/dispatch/route';

function reqFor(body: any) {
  return new NextRequest('http://localhost/api/master/admin/dispatch', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });
}
const sendBody = { action: 'send', requestId: 'req-1', operatorId: 'op-1' };
const createBody = { action: 'create_and_send', requestId: 'req-1', operator: { company_name: 'Synthetic Co', company_email: 'op@synthetic.test', company_phone: '555-0100' } };

describe('admin dispatch send branches must refuse closed requests', () => {
  beforeEach(() => { h.emails.length = 0; h.claimLinks.length = 0; h.state.status = 'pending'; });

  it('control: send on a pending request succeeds and emails the operator', async () => {
    const res = await POST(reqFor(sendBody));
    expect(res.status).toBe(200);
    expect(h.emails).toHaveLength(1);
  });

  it('control: create_and_send on a pending request succeeds and emails the operator', async () => {
    const res = await POST(reqFor(createBody));
    expect(res.status).toBe(200);
    expect(h.emails.length).toBeGreaterThanOrEqual(1);
  });

  it('attack: send on a cancelled request is refused with no email or claim link', async () => {
    h.state.status = 'cancelled';
    const res = await POST(reqFor(sendBody));
    expect(res.status).toBe(400);
    expect(h.emails).toEqual([]);
    expect(h.claimLinks).toEqual([]);
  });

  it('attack: send on a completed request is refused with no email or claim link', async () => {
    h.state.status = 'completed';
    const res = await POST(reqFor(sendBody));
    expect(res.status).toBe(400);
    expect(h.emails).toEqual([]);
    expect(h.claimLinks).toEqual([]);
  });

  it('attack: send on a booked request is refused with no email or claim link', async () => {
    h.state.status = 'booked';
    const res = await POST(reqFor(sendBody));
    expect(res.status).toBe(400);
    expect(h.emails).toEqual([]);
    expect(h.claimLinks).toEqual([]);
  });

  it('attack: create_and_send on a cancelled request is refused with no email or claim link', async () => {
    h.state.status = 'cancelled';
    const res = await POST(reqFor(createBody));
    expect(res.status).toBe(400);
    expect(h.emails).toEqual([]);
    expect(h.claimLinks).toEqual([]);
  });
});
