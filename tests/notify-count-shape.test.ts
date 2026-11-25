/**
 * PERMANENT REGRESSION — BUS-NOTIFY-COUNT-SHAPE-001 (converted from the loop probe of cycle 2026-11-23-0652; assertions unchanged)
 * POST /api/quotes/notify (session-authenticated rider) destructures
 * quoteCount from the JSON body and checks it only for truthiness, then
 * interpolates it verbatim into the notification email subject/body in
 * the no-quotes branch ("${quoteCount} operator(s) quoted your route").
 * Invariant: quoteCount must be a positive integer; any hostile shape
 * (string, negative, fractional, boolean, array, object) is refused 400
 * before any email is sent, while a genuine count succeeds and renders
 * exactly in the subject.
 * Harness: in-memory mocked Supabase; mocked email/SMS transports;
 * synthetic rider + request only. No real sends.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const REQ = '11111111-1111-4111-8111-111111111111';

const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store: Record<string, Row[]> = { profiles: [], transport_requests: [] };
  const emails: any[] = [];
  class QB {
    table: string; filters: Array<[string, any]> = [];
    constructor(t: string) { this.table = t; }
    select() { return this; }
    eq(k: string, v: any) { this.filters.push([k, v]); return this; }
    exec() { return (store[this.table] || []).filter((r) => this.filters.every(([k, v]) => r[k] === v)); }
    async single() { const rows = this.exec(); return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }; }
    then(res: any, rej: any) { try { res({ data: this.exec(), error: null }); } catch (e) { rej(e); } }
  }
  return { store, emails, QB };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (t: string) => new h.QB(t),
  }),
}));
vi.mock('@/lib/email', () => ({
  sendEmail: async (m: any) => { h.emails.push(m); return { success: true }; },
  emailTemplates: { quoteReceived: (x: any) => ({ subject: 'q', html: 'q' }) },
}));
vi.mock('@/lib/tokens', () => ({ generateUserTripToken: async () => 'tok' }));
vi.mock('@/lib/email-helpers', () => ({ generateTripViewLink: async () => 'http://localhost/claim' }));
vi.mock('@/lib/sms', () => ({
  sendSMS: async () => ({ success: true }),
  smsTemplates: { newRequestAlert: (x: any) => ({ body: 'sms' }) },
}));

import { POST } from '@/app/api/quotes/notify/route';

function seed() {
  h.emails.length = 0;
  h.store.profiles = [{ id: 'user-1', email: 'rider@example.com', full_name: 'Synthetic Rider', phone: null, sms_opt_in: false }];
  h.store.transport_requests = [{ id: REQ, user_id: 'user-1', status: 'quoted', service_type: 'airport', pickup_fuzzy: 'Everett', dropoff_fuzzy: 'Logan', start_date: '2026-12-01', quotes: [] }];
}
function reqFor(quoteCount: any) {
  return new NextRequest('http://localhost/api/quotes/notify', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tripRequestId: REQ, quoteCount, emailType: 'quotes_received' }),
  });
}

describe('quote notification quoteCount shapes', () => {
  beforeEach(seed);
  it('control: genuine count 3 succeeds, one email, exact subject', async () => {
    const res = await POST(reqFor(3));
    expect(res.status).toBe(200);
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0].subject).toBe('3 operators quoted your route');
  });
  it('attack: string count "3" is refused 400 and sends nothing', async () => {
    const res = await POST(reqFor('3')); expect(res.status).toBe(400); expect(h.emails).toHaveLength(0);
  });
  it('attack: negative count -3 is refused 400 and sends nothing', async () => {
    const res = await POST(reqFor(-3)); expect(res.status).toBe(400); expect(h.emails).toHaveLength(0);
  });
  it('attack: fractional count 2.5 is refused 400 and sends nothing', async () => {
    const res = await POST(reqFor(2.5)); expect(res.status).toBe(400); expect(h.emails).toHaveLength(0);
  });
  it('attack: boolean count true is refused 400 and sends nothing', async () => {
    const res = await POST(reqFor(true)); expect(res.status).toBe(400); expect(h.emails).toHaveLength(0);
  });
  it('attack: array count [3] is refused 400 and sends nothing', async () => {
    const res = await POST(reqFor([3])); expect(res.status).toBe(400); expect(h.emails).toHaveLength(0);
  });
  it('attack: object count {count:3} is refused 400 and sends nothing', async () => {
    const res = await POST(reqFor({ count: 3 })); expect(res.status).toBe(400); expect(h.emails).toHaveLength(0);
  });
});
