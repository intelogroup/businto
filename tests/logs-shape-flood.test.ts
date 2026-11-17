/**
 * PERMANENT REGRESSION — BUS-LOGS-SHAPE-FLOOD-001 (converted from the loop probe of cycle 2026-11-16-1552; assertions unchanged)
 * POST /api/logs hostile shapes / flood.
 * Public unauthenticated endpoint writing attacker input to event_logs.
 * Invariant: event_type is a bounded string, status is restricted to
 * success|error, message/metadata are size-bounded, and rapid
 * unauthenticated calls are throttled (429) before logEvent; or hostile
 * shapes refused 400. Control exact.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/event-logger', () => ({ logEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
import { POST } from '@/app/api/logs/route';
import { logEvent } from '@/lib/event-logger';
import { createClient } from '@/lib/supabase/server';
const req = (body: any) => new NextRequest('http://localhost/api/logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const calls = () => (logEvent as any).mock.calls.map((c: any) => c[0]);
describe('logs hostile shapes', () => {
  beforeEach(() => { vi.clearAllMocks(); (logEvent as any).mockResolvedValue(undefined); (createClient as any).mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } }); });
  it('control: normal event logged with session-null identity', async () => {
    const r = await POST(req({ event_type: 'token_expired', message: 'link expired' }));
    expect(r.status).toBe(200); expect(calls()).toHaveLength(1);
    expect(calls()[0].event_type).toBe('client.token_expired'); expect(calls()[0].user_id).toBeNull(); expect(calls()[0].status).toBe('error');
  });
  it('attack: non-string / oversized event_type refused 400 and not logged', async () => {
    for (const et of [12345, true, ['x'], { a: 1 }, 'x'.repeat(10000)]) {
      (logEvent as any).mockClear();
      const r = await POST(req({ event_type: et, message: 'm' }));
      expect(r.status, String(et).slice(0, 20)).toBe(400); expect(calls()).toHaveLength(0);
    }
  });
  it('attack: arbitrary status refused 400 or coerced to success|error', async () => {
    for (const st of ['pwned', 123, true, ['success']]) {
      (logEvent as any).mockClear();
      const r = await POST(req({ event_type: 'crash', status: st }));
      if (r.status === 400) { expect(calls()).toHaveLength(0); continue; }
      expect(r.status).toBe(200); expect(['success', 'error']).toContain(calls()[0].status);
    }
  });
  it('attack: oversized message/metadata refused 400 or bounded before logEvent', async () => {
    const big = 'a'.repeat(100000);
    const r = await POST(req({ event_type: 'crash', message: big, metadata: { blob: big }, request_id: big }));
    if (r.status === 400) return;
    expect(r.status).toBe(200); const c = calls()[0];
    expect((c.message || '').length).toBeLessThanOrEqual(2000);
    expect(JSON.stringify(c.metadata || {}).length).toBeLessThanOrEqual(5000);
    expect(String(c.request_id || '').length).toBeLessThanOrEqual(200);
  });
  it('attack: 25 rapid unauthenticated calls throttled before logEvent', async () => {
    let throttled = 0;
    for (let i = 0; i < 25; i++) { const r = await POST(req({ event_type: 'flood', message: 'x' })); if (r.status === 429) throttled++; }
    expect(throttled).toBeGreaterThan(0); expect(calls().length).toBeLessThan(25);
  });
});
