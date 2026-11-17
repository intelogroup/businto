/**
 * PERMANENT REGRESSION — BUS-EMAIL-SEND-TYPE-SHAPE-001 (converted from the loop probe of cycle 2026-11-16-2152; assertions unchanged)
 * POST /api/email/send: recipient-binding re-proof (BUS-EMAIL-SPOOF-001,
 * verified fixed 2026-11-03-1252) plus hostile-shape extension legs.
 * Invariant: platform-branded email goes only to the authenticated caller's
 * own address, and hostile body shapes (non-string type/to) fail closed
 * with a 4xx — never a 500, never a send.
 * Harness: requireUser mocked (authenticated synthetic rider); sendEmail
 * mocked as a capture sink; REAL emailTemplates render. No real email sent.
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

describe('email/send binding re-proof + hostile shapes', () => {
  beforeEach(() => { h.sent = []; });
  it('control: caller mailing their OWN address succeeds', async () => {
    const res = await send({ type: 'quote_received', to: 'rider@example.com', data: quoteData });
    expect(res.status).toBe(200);
    expect(h.sent.length).toBe(1);
    expect(h.sent[0].to).toBe('rider@example.com');
  });
  it('re-proof: arbitrary recipient is refused and not sent', async () => {
    const res = await send({ type: 'quote_received', to: 'victim@arbitrary.example', data: quoteData });
    expect(h.sent.filter((s) => s.to === 'victim@arbitrary.example').length).toBe(0);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
  it('re-proof: recipient smuggled via data.userEmail is refused and not sent', async () => {
    const res = await send({ type: 'payment_success', data: { ...quoteData, userEmail: 'victim2@arbitrary.example', amount: 999 } });
    expect(h.sent.filter((s) => s.to === 'victim2@arbitrary.example').length).toBe(0);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
  it('control: case/whitespace variant of own address still succeeds (documented binding leniency)', async () => {
    const res = await send({ type: 'quote_received', to: ' Rider@Example.com ', data: quoteData });
    expect(res.status).toBe(200);
    expect(h.sent.length).toBe(1);
  });
  it('attack: non-string type shapes fail closed 4xx, never 500, never send', async () => {
    for (const bad of [12345, true, ['quote_received'], { t: 'quote_received' }, 1.5]) {
      h.sent = [];
      const res = await send({ type: bad as any, to: 'rider@example.com', data: quoteData });
      expect(res.status, JSON.stringify(bad)).toBeGreaterThanOrEqual(400);
      expect(res.status, JSON.stringify(bad)).toBeLessThan(500);
      expect(h.sent.length).toBe(0);
    }
  });
  it('attack: non-string to shapes never send and never 500', async () => {
    for (const bad of [['victim@arbitrary.example'], { addr: 'victim@arbitrary.example' }, 12345, true]) {
      h.sent = [];
      const res = await send({ type: 'quote_received', to: bad as any, data: quoteData });
      expect(res.status, JSON.stringify(bad)).toBeLessThan(500);
      expect(h.sent.filter((s) => JSON.stringify(s.to).includes('arbitrary')).length).toBe(0);
    }
  });
});
