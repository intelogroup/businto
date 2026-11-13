/**
 * PERMANENT REGRESSION — BUS-MSG-CONTENT-SHAPE-001 (converted from the loop probe of cycle 2026-11-12-2152; assertions unchanged)
 * POST /api/messages (src/app/api/messages/route.ts) checks only
 * `!recipient_id || !content`, then inserts `content` verbatim and
 * afterwards calls content.substring(0, 100) for the notification.
 * A truthy non-string content (number / boolean / array / object)
 * therefore reaches the messages insert verbatim — and the number /
 * boolean / object shapes then throw on .substring AFTER the row
 * was written, so the caller sees a 500 for a message that exists.
 * Invariant: `content` must be a string — non-string shapes are
 * refused 400 BEFORE any message or notification insert, while a
 * genuine string message between booking participants succeeds.
 * Harness: in-memory mocked Supabase recording inserts; synthetic
 * authenticated user, synthetic booking participants only.
 * Sibling surface of BUS-MSG-PATCH-SHAPE-001 (same file, PATCH leg).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  const messageInserts: any[] = [];
  const notificationInserts: any[] = [];
  return { messageInserts, notificationInserts };
});

const USER = 'user-1';
const OPERATOR = 'operator-1';
const BOOKING = 'booking-1';

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'bookings') return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { user_id: USER, operator_id: OPERATOR }, error: null }) }) }),
      };
      if (table === 'messages') return {
        insert: (row: any) => { h.messageInserts.push(row); return { select: () => ({ single: async () => ({ data: { id: 'msg-1', ...row }, error: null }) }) }; },
      };
      if (table === 'unified_profiles') return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { id: USER, full_name: 'Synthetic Rider', phone: null }, error: null }) }) }),
      };
      if (table === 'notifications') return {
        insert: (row: any) => { h.notificationInserts.push(row); return Promise.resolve({ error: null }); },
      };
      return { insert: () => Promise.resolve({ error: null }) };
    },
  },
  requireUser: async () => ({ id: USER, email: 'rider@synthetic.test' }),
  requireAdmin: async () => null,
}));
vi.mock('@/lib/sms', () => ({ sendSMS: async () => ({ success: true }), smsTemplates: { newMessage: () => ({ content: 'test' }) } }));
vi.mock('@/lib/policy', () => ({ validateRequestParticipation: async () => null }));

import { POST } from '@/app/api/messages/route';

function reqFor(body: any) {
  return new NextRequest('http://localhost/api/messages', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const base = { sender_id: USER, recipient_id: OPERATOR, booking_id: BOOKING };

describe('messages POST must validate content shape before insert', () => {
  beforeEach(() => { h.messageInserts.length = 0; h.notificationInserts.length = 0; });

  it('control: string content succeeds, one message + one notification', async () => {
    const res = await POST(reqFor({ ...base, content: 'hello operator' }));
    expect(res.status).toBe(200);
    expect(h.messageInserts).toHaveLength(1);
    expect(h.messageInserts[0].content).toBe('hello operator');
    expect(h.notificationInserts).toHaveLength(1);
  });

  it('attack: numeric content is refused 400 with no insert', async () => {
    const res = await POST(reqFor({ ...base, content: 12345 }));
    expect(res.status).toBe(400);
    expect(h.messageInserts).toEqual([]);
    expect(h.notificationInserts).toEqual([]);
  });

  it('attack: boolean content is refused 400 with no insert', async () => {
    const res = await POST(reqFor({ ...base, content: true }));
    expect(res.status).toBe(400);
    expect(h.messageInserts).toEqual([]);
  });

  it('attack: array content is refused 400 with no insert', async () => {
    const res = await POST(reqFor({ ...base, content: ['hello'] }));
    expect(res.status).toBe(400);
    expect(h.messageInserts).toEqual([]);
  });

  it('attack: object content is refused 400 with no insert', async () => {
    const res = await POST(reqFor({ ...base, content: { text: 'hello' } }));
    expect(res.status).toBe(400);
    expect(h.messageInserts).toEqual([]);
  });
});
