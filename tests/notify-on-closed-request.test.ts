/**
 * PERMANENT REGRESSION — BUS-NOTIFY-CLOSED-REQUEST-001 (adversarial-loop probe cycle 2026-11-04-2152, repeated through 2026-11-05-0652; fixed 2026-11-05)
 * Scenario: quote NOTIFY on a closed transport request.
 * POST /api/quotes/notify (owner session) checked ownership of the named
 * request but never read its status, and trusts the caller-supplied
 * quoteCount in the fallback email body/subject. It was a remaining
 * quote-family surface the shared open-status guard
 * (src/lib/request-status.ts) did not cover, alongside decline. The
 * route now selects the request status and applies isOpenRequestStatus
 * before any email/SMS side effect.
 *
 * Invariant: a quote notification (email/SMS side effect) may fire only
 * for an OPEN request (pending/quoted); a cancelled or completed request
 * must be refused with no email and no SMS sent.
 * Harness: in-memory fake supabase via createClient mock; sendEmail /
 * sendSMS are capture sinks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { profiles: [], transport_requests: [] };
  const sentEmails: any[] = [];
  const sentSMS: any[] = [];
  class QB {
    table: string; filters: Array<[string, any]> = [];
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    match(r: Row) { return this.filters.every(([k, v]) => r[k] === v); }
    async single() {
      const rows = (store[this.table] || []).filter((r) => this.match(r));
      return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } };
    }
  }
  return { store, QB, sentEmails, sentSMS };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (t: string) => new h.QB(t),
  }),
}));
vi.mock('@/lib/email', () => ({
  sendEmail: async (m: any) => { h.sentEmails.push(m); return { success: true }; },
  emailTemplates: { quoteReceived: (d: any) => ({ subject: 'quote', html: `<p>${d.operatorName} ${d.price}</p>` }) },
}));
vi.mock('@/lib/email-helpers', () => ({ generateTripViewLink: async () => 'https://example.test/view' }));
vi.mock('@/lib/tokens', () => ({ generateUserTripToken: () => 'tok' }));
vi.mock('@/lib/sms', () => ({
  sendSMS: async (m: any) => { h.sentSMS.push(m); return { success: true }; },
  smsTemplates: { newRequestAlert: (d: any) => ({ body: `alert ${d.serviceType}` }) },
}));

import { POST } from '@/app/api/quotes/notify/route';

function seed() {
  h.store.profiles = [{ id: 'user-1', email: 'owner@example.test', full_name: 'Owner', phone: '+10000000000', sms_opt_in: true }];
  const mk = (id: string, status: string) => ({ id, user_id: 'user-1', status, service_type: 'airport', pickup_fuzzy: 'Everett', dropoff_fuzzy: 'Logan', start_date: '2026-12-01', quotes: [] });
  h.store.transport_requests = [mk('req-open', 'quoted'), mk('req-cancelled', 'cancelled'), mk('req-completed', 'completed')];
  h.sentEmails.length = 0; h.sentSMS.length = 0;
}

function call(tripRequestId: string) {
  const req = new NextRequest('http://localhost/api/quotes/notify', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tripRequestId, quoteCount: 3, emailType: 'quote_received' }),
  });
  return POST(req);
}

describe('quote notify on closed request (regression)', () => {
  beforeEach(seed);
  it('control: open (quoted) request notifies the owner', async () => {
    const res = await call('req-open');
    expect(res.status).toBe(200);
    expect(h.sentEmails.length).toBe(1);
  });
  it('attack: cancelled request produces no notification', async () => {
    const res = await call('req-cancelled');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.sentEmails.length).toBe(0);
    expect(h.sentSMS.length).toBe(0);
  });
  it('attack: completed request produces no notification', async () => {
    const res = await call('req-completed');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h.sentEmails.length).toBe(0);
    expect(h.sentSMS.length).toBe(0);
  });
});
