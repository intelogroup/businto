// REGRESSION TEST — promoted verbatim from loop probe, cycle 2026-11-09-0652; Phase 3 policy layer (src/lib/policy.ts) — Businto (BUS-LOGS-FOREIGN-REQUEST-001)
// Loop probe 2026-11-09-0652 (NEW, scout-queue candidate businto/logs-unauthenticated-foreign-request):
// Unauthenticated POST /api/logs attaches caller-chosen entries to a foreign request_id.
// Invariant: event-log entries for a transport request may be created only for a request the
// caller owns/participates in / is session-bound to; an unauthenticated caller cannot attach
// fabricated events to a foreign request.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const captured: any[] = [];
vi.mock('@/lib/event-logger', () => ({
  logEvent: async (input: any) => { captured.push(input); },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) }, // unauthenticated caller
  }),
}));

import { POST } from '@/app/api/logs/route';

function post(body: any) {
  return POST(new NextRequest('http://localhost/api/logs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'probe' },
    body: JSON.stringify(body),
  }));
}

const FOREIGN_REQUEST_ID = 'req-foreign-victim-0001';

describe('POST /api/logs foreign request binding', () => {
  beforeEach(() => { captured.length = 0; });

  it('control: pre-session error log without request_id is accepted and unbound', async () => {
    const res = await post({ event_type: 'claim_link_expired', message: 'token expired before session' });
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0].request_id ?? null).toBeNull();
    expect(captured[0].user_id).toBeNull();
  });

  it('attack: unauthenticated caller cannot attach a fabricated event to a foreign request', async () => {
    const res = await post({
      event_type: 'payment_confirmed',
      status: 'success',
      message: 'Rider paid in full (fabricated)',
      request_id: FOREIGN_REQUEST_ID,
      metadata: { amount: 99999, forged: true },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(captured.filter((c) => c.request_id === FOREIGN_REQUEST_ID)).toHaveLength(0);
  });

  it('attack: unauthenticated volume against a foreign request is bounded', async () => {
    for (let i = 0; i < 5; i++) {
      await post({ event_type: 'spam_event', message: `spam ${i}`, request_id: FOREIGN_REQUEST_ID });
    }
    expect(captured.filter((c) => c.request_id === FOREIGN_REQUEST_ID)).toHaveLength(0);
  });
});
