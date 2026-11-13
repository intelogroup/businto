/**
 * PERMANENT REGRESSION — BUS-MSG-PATCH-SHAPE-001 (converted from the loop probe of cycle 2026-11-12-0352; assertions unchanged)
 * PATCH /api/messages (src/app/api/messages/route.ts) destructures
 * { message_ids, is_read } and checks only message_ids?.length, then
 * runs .update({ is_read: is_read ?? true }).in('id', message_ids).
 * A string or array-like object passes the length check and reaches
 * .in() verbatim; a non-boolean is_read is written verbatim.
 * Invariant: message_ids must be an array and is_read (when present)
 * a boolean — anything else is refused 400 BEFORE any data-layer
 * update, while a genuine array+boolean mark-read succeeds scoped
 * to the caller as recipient.
 * Harness: in-memory mocked Supabase recording update payloads and
 * .in() arguments; synthetic authenticated user only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  const updates: any[] = [];
  const inArgs: any[] = [];
  const eqArgs: any[] = [];
  class QB {
    update(p: any) { updates.push(p); return this; }
    in(k: string, v: any) { inArgs.push([k, v]); return this; }
    eq(k: string, v: any) { eqArgs.push([k, v]); return this; }
    then(res: any) { res({ data: null, error: null }); }
  }
  return { updates, inArgs, eqArgs, QB };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => new h.QB() },
  supabase: { from: (t: string) => new h.QB() },
  requireUser: async () => ({ id: 'user-1', email: 'rider@synthetic.test' }),
  requireAdmin: async () => ({ id: 'admin-1' }),
}));
vi.mock('@/lib/sms', () => ({ sendSMS: async () => ({}), smsTemplates: {} }));
vi.mock('@/lib/policy', () => ({ validateRequestParticipation: async () => true }));

import { PATCH } from '@/app/api/messages/route';

function reqFor(body: any) {
  return new NextRequest('http://localhost/api/messages', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('messages PATCH must validate message_ids / is_read shapes', () => {
  beforeEach(() => { h.updates.length = 0; h.inArgs.length = 0; h.eqArgs.length = 0; });

  it('control: array ids + boolean is_read succeeds, recipient-scoped', async () => {
    const res = await PATCH(reqFor({ message_ids: ['m1', 'm2'], is_read: true }));
    expect(res.status).toBe(200);
    expect(h.updates).toEqual([{ is_read: true }]);
    expect(h.inArgs).toEqual([['id', ['m1', 'm2']]]);
    expect(h.eqArgs).toEqual([['recipient_id', 'user-1']]);
  });

  it('attack: string message_ids is refused 400 with no update', async () => {
    const res = await PATCH(reqFor({ message_ids: 'm1', is_read: true }));
    expect(res.status).toBe(400);
    expect(h.updates).toEqual([]);
  });

  it('attack: array-like object message_ids is refused 400 with no update', async () => {
    const res = await PATCH(reqFor({ message_ids: { 0: 'm1', length: 1 }, is_read: true }));
    expect(res.status).toBe(400);
    expect(h.updates).toEqual([]);
  });

  it('attack: string is_read is refused 400 with no update', async () => {
    const res = await PATCH(reqFor({ message_ids: ['m1'], is_read: 'false' }));
    expect(res.status).toBe(400);
    expect(h.updates).toEqual([]);
  });

  it('attack: numeric is_read is refused 400 with no update', async () => {
    const res = await PATCH(reqFor({ message_ids: ['m1'], is_read: 0 }));
    expect(res.status).toBe(400);
    expect(h.updates).toEqual([]);
  });

  it('attack: object is_read is refused 400 with no update', async () => {
    const res = await PATCH(reqFor({ message_ids: ['m1'], is_read: { value: true } }));
    expect(res.status).toBe(400);
    expect(h.updates).toEqual([]);
  });
});
