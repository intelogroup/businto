/**
 * Permanent regression — BUS-EMAIL-SPOOF-001.
 * POST /api/email/send: platform-branded template mail may only be sent to
 * the authenticated caller's own email address — whether the recipient
 * arrives as top-level `to` or nested `data.userEmail`. Adapted from the
 * loop probe of cycle 2026-11-03-0352 (preserved in the loop evidence).
 * Harness: requireUser mocked; sendEmail mocked as a capture sink; the REAL
 * emailTemplates render the content. No real email is sent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ sent: [] as Array<Record<string, any>> }));

vi.mock('@/lib/supabase/admin', () => ({
  requireUser: async () => ({ id: 'user-1', email: 'rider@example.com' }),
}));

vi.mock('@/lib/email', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    sendEmail: async (opts: Record<string, any>) => {
      h.sent.push(opts);
      return { id: 'mock-msg-1' };
    },
  };
});

import { POST } from '@/app/api/email/send/route';

async function send(body: Record<string, any>) {
  const req = new NextRequest('http://localhost/api/email/send', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req);
}

const quoteData = {
  userName: 'Victim', operatorName: 'Fake Luxury Transport', price: 1,
  pickupLocation: '1 Main St', dropoffLocation: '2 Oak St', date: '2026-12-01', time: '09:00',
};

describe('email/send recipient binding (BUS-EMAIL-SPOOF-001)', () => {
  beforeEach(() => { h.sent = []; });
  it('control: authenticated caller mailing their OWN address succeeds', async () => {
    const res = await send({ type: 'quote_received', to: 'rider@example.com', data: quoteData });
    expect(res.status).toBe(200);
    expect(h.sent.length).toBe(1);
    expect(h.sent[0].to).toBe('rider@example.com');
  });
  it('own address via the nested data.userEmail format also succeeds', async () => {
    const res = await send({ type: 'payment_success', data: { ...quoteData, userEmail: 'rider@example.com', amount: 999 } });
    expect(res.status).toBe(200);
    expect(h.sent.length).toBe(1);
    expect(h.sent[0].to).toBe('rider@example.com');
  });
  it('attack: platform template to an ARBITRARY recipient with caller-chosen content is not sent', async () => {
    const res = await send({ type: 'quote_received', to: 'victim@arbitrary.example', data: quoteData });
    expect(h.sent.filter((s) => s.to === 'victim@arbitrary.example').length).toBe(0);
    expect(h.sent.length).toBe(0);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
  it('attack (nested format): recipient smuggled via data.userEmail is not sent either', async () => {
    const res = await send({ type: 'payment_success', data: { ...quoteData, userEmail: 'victim2@arbitrary.example', amount: 999 } });
    expect(h.sent.filter((s) => s.to === 'victim2@arbitrary.example').length).toBe(0);
    expect(h.sent.length).toBe(0);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
