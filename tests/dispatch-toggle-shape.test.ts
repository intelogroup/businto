/**
 * PERMANENT REGRESSION — BUS-DISPATCH-TOGGLE-SHAPE-001 (converted from the loop probe of cycle 2026-11-12-0952; assertions unchanged)
 * POST /api/master/admin/dispatch (src/app/api/master/admin/dispatch/route.ts)
 * action:'toggle' branch copies body.enabled verbatim into the
 * app_settings upsert (key 'manual_dispatch_mode'), echoes it back as
 * manualDispatchMode, and picks the audit-log event by its truthiness.
 * The GET branch reads the setting back with `value === true`, so a
 * stored string "true" reads as OFF while the POST reported success,
 * and a string "false" is stored verbatim and logged as ENABLED.
 * No typeof check exists on this branch (contrast: the sibling
 * operator/availability PATCH refuses non-boolean toggles with 400).
 * Invariant: a toggle whose `enabled` is not a boolean must be
 * refused 400 BEFORE any data-layer write, while a genuine boolean
 * toggle succeeds and stores exactly that boolean.
 * Harness: in-memory mocked Supabase recording every upsert payload;
 * admin gate satisfied by the mock (synthetic admin). No email is
 * sent: the toggle branch never reaches the email paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  const upserts: any[] = [];
  const logs: any[] = [];
  class QB {
    upsert(p: any) { upserts.push(p); return this; }
    select() { return this; }
    eq() { return this; }
    async maybeSingle() { return { data: null, error: null }; }
    then(res: any) { res({ data: null, error: null }); }
  }
  return { upserts, logs, QB };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB() },
  supabase: { from: (t: string) => new h.QB() },
  requireAdmin: async () => ({ id: 'admin-1', email: 'admin@synthetic.test' }),
  requireUser: async () => ({ id: 'admin-1' }),
}));
vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB() },
  supabase: { from: (t: string) => new h.QB() },
  requireAdmin: async () => ({ id: 'admin-1', email: 'admin@synthetic.test' }),
  requireUser: async () => ({ id: 'admin-1' }),
}));
vi.mock('@/lib/email', () => ({
  sendEmail: async () => ({}),
  emailTemplates: { operatorNewRequest: () => ({}), adminDispatchedNotification: () => ({}), quoteReceived: () => ({}), quotesBulkReceived: () => ({}), operatorOrderDetails: () => ({}) },
  getAppBaseUrl: () => 'http://localhost',
}));
vi.mock('@/lib/email-helpers', () => ({ generateOperatorQuoteLink: async () => 'http://localhost/x' }));
vi.mock('@/lib/operator-matching', () => ({ extractRequirements: () => [] }));
vi.mock('@/lib/event-logger', () => ({ logEvent: async (e: any) => { h.logs.push(e); } }));

import { POST } from '@/app/api/master/admin/dispatch/route';

function reqFor(body: any) {
  return new NextRequest('http://localhost/api/master/admin/dispatch', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('admin dispatch toggle must validate the enabled shape', () => {
  beforeEach(() => { h.upserts.length = 0; h.logs.length = 0; });

  it('control: boolean true succeeds and stores exactly true', async () => {
    const res = await POST(reqFor({ action: 'toggle', enabled: true }));
    expect(res.status).toBe(200);
    expect(h.upserts).toHaveLength(1);
    expect(h.upserts[0].key).toBe('manual_dispatch_mode');
    expect(h.upserts[0].value).toBe(true);
    const json = await res.json();
    expect(json.manualDispatchMode).toBe(true);
  });

  it('control: boolean false succeeds and stores exactly false', async () => {
    const res = await POST(reqFor({ action: 'toggle', enabled: false }));
    expect(res.status).toBe(200);
    expect(h.upserts).toHaveLength(1);
    expect(h.upserts[0].value).toBe(false);
  });

  it('attack: string "false" is refused 400 with no write', async () => {
    const res = await POST(reqFor({ action: 'toggle', enabled: 'false' }));
    expect(res.status).toBe(400);
    expect(h.upserts).toEqual([]);
  });

  it('attack: string "true" is refused 400 with no write', async () => {
    const res = await POST(reqFor({ action: 'toggle', enabled: 'true' }));
    expect(res.status).toBe(400);
    expect(h.upserts).toEqual([]);
  });

  it('attack: numeric 1 is refused 400 with no write', async () => {
    const res = await POST(reqFor({ action: 'toggle', enabled: 1 }));
    expect(res.status).toBe(400);
    expect(h.upserts).toEqual([]);
  });

  it('attack: missing enabled is refused 400 with no write', async () => {
    const res = await POST(reqFor({ action: 'toggle' }));
    expect(res.status).toBe(400);
    expect(h.upserts).toEqual([]);
  });

  it('attack: object enabled is refused 400 with no write', async () => {
    const res = await POST(reqFor({ action: 'toggle', enabled: { value: true } }));
    expect(res.status).toBe(400);
    expect(h.upserts).toEqual([]);
  });
});
