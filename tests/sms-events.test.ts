import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabaseAdmin } from '../src/lib/supabase-server';
import { sendSMS, smsTemplates } from '@/lib/sms';

// ---------------------------------------------------------------------------
// Route integration tests: SMS wiring for quoteAccepted and newMessage events.
//
// quotes/accept/route.ts  → smsTemplates.quoteAccepted (called when user has phone)
// messages/route.ts       → smsTemplates.newMessage    (called when recipient has phone)
// ---------------------------------------------------------------------------

vi.mock('../src/lib/supabase-server', () => {
  const mock: any = {};
  const self = () => mock;
  mock.from = vi.fn(self);
  mock.select = vi.fn(self);
  mock.eq = vi.fn(self);
  mock.neq = vi.fn(self);
  mock.update = vi.fn(self);
  mock.insert = vi.fn(self);
  mock.order = vi.fn(self);
  mock.single = vi.fn();
  mock.maybeSingle = vi.fn();
  return {
    supabaseAdmin: mock,
    requireUser: vi.fn().mockResolvedValue({ id: 'user-456' }),
  };
});

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: 'mock-email-id' }),
  getAppBaseUrl: vi.fn().mockReturnValue('https://businto.com'),
  emailTemplates: {
    bookingConfirmation: vi.fn().mockReturnValue({ subject: 'Booking Confirmed', html: '<p>Confirmed</p>' }),
    operatorOrderDetails: vi.fn().mockReturnValue({ subject: 'Order Details', html: '<p>Details</p>' }),
  },
}));

vi.mock('@/lib/sms', () => ({
  sendSMS: vi.fn().mockResolvedValue({ success: true }),
  smsTemplates: {
    quoteAccepted: vi.fn().mockReturnValue({ content: 'Mock quoteAccepted SMS', tag: 'user_quote_accepted' }),
    newMessage: vi.fn().mockReturnValue({ content: 'Mock newMessage SMS', tag: 'new_message_alert' }),
    newRequestAlert: vi.fn().mockReturnValue({ content: 'Mock newRequestAlert SMS', tag: 'operator_new_request' }),
  },
}));

vi.mock('@/lib/tokens', () => ({
  verifyUserTripToken: vi.fn().mockResolvedValue({ requestId: 'req-123', userId: 'user-456' }),
}));

vi.mock('@/lib/event-logger', () => ({
  logEvent: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/app-settings', () => ({
  getDispatchMode: vi.fn().mockResolvedValue(false),
  invalidateSettingsCache: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-456' } } }),
    },
  }),
}));

// Restore self-referential chain after vi.clearAllMocks() resets mockImpl
function restoreChain() {
  const mock = supabaseAdmin as any;
  const self = () => mock;
  mock.from.mockImplementation(self);
  mock.select.mockImplementation(self);
  mock.eq.mockImplementation(self);
  mock.neq.mockImplementation(self);
  mock.update.mockImplementation(self);
  mock.insert.mockImplementation(self);
  mock.order.mockImplementation(self);
  mock.maybeSingle.mockResolvedValue({ data: null, error: null });
}

// ── quotes/accept/route.ts ───────────────────────────────────────────────────

import { POST as acceptPOST } from '../src/app/api/quotes/accept/route';
import { POST as messagesPOST } from '../src/app/api/messages/route';
import { NextRequest } from 'next/server';

describe('quotes/accept route — SMS wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreChain();
  });

  it('calls sendSMS with quoteAccepted template when user has a phone number', async () => {
    (supabaseAdmin as any).single
      .mockResolvedValueOnce({ data: { status: 'pending', user_id: 'user-456', metadata_private: {} }, error: null })
      .mockResolvedValueOnce({
        data: {
          id: 'quote-789',
          operator_id: 'op-999',
          total_price: 150,
          vehicle_type: 'Van',
          operator: { company_name: 'Quick Trans', company_email: 'op@tabronai.com', company_phone: '5559990000' },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: 'req-123',
          pickup_fuzzy: '123 Main',
          dropoff_fuzzy: '456 Oak',
          start_date: '2026-04-01',
          start_time: '09:00',
          userProfile: { email: 'user@test.com', full_name: 'Test User', phone: '5551234567' },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'booking-001', confirmation_code: 'BUS-456' }, error: null });
    // Atomic guard: simulate successful status update (not a race condition)
    (supabaseAdmin as any).maybeSingle.mockResolvedValueOnce({ data: { id: 'req-123' }, error: null });

    const req = new NextRequest('https://businto.com/api/quotes/accept', {
      method: 'POST',
      body: JSON.stringify({ quoteId: 'quote-789', tripRequestId: 'req-123' }),
    });

    const response = await acceptPOST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(sendSMS).toHaveBeenCalledWith(expect.objectContaining({ to: '5551234567' }));
    expect(smsTemplates.quoteAccepted).toHaveBeenCalledWith(
      expect.objectContaining({ operatorName: 'Quick Trans', requestId: 'req-123' })
    );
  });

  it('does not call sendSMS when user profile has no phone number', async () => {
    (supabaseAdmin as any).single
      .mockResolvedValueOnce({ data: { status: 'pending', user_id: 'user-456', metadata_private: {} }, error: null })
      .mockResolvedValueOnce({
        data: {
          id: 'quote-789',
          operator_id: 'op-999',
          total_price: 150,
          vehicle_type: 'Van',
          operator: { company_name: 'Quick Trans', company_email: 'op@tabronai.com', company_phone: null },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: 'req-123',
          pickup_fuzzy: '123 Main',
          dropoff_fuzzy: '456 Oak',
          start_date: '2026-04-01',
          start_time: '09:00',
          userProfile: { email: 'user@test.com', full_name: 'Test User', phone: null },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'booking-001', confirmation_code: 'BUS-456' }, error: null });
    // Atomic guard: simulate successful status update (not a race condition)
    (supabaseAdmin as any).maybeSingle.mockResolvedValueOnce({ data: { id: 'req-123' }, error: null });

    const req = new NextRequest('https://businto.com/api/quotes/accept', {
      method: 'POST',
      body: JSON.stringify({ quoteId: 'quote-789', tripRequestId: 'req-123' }),
    });

    await acceptPOST(req);
    expect(sendSMS).not.toHaveBeenCalled();
  });
});

// ── messages/route.ts ────────────────────────────────────────────────────────

describe('messages route — SMS wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreChain();
  });

  it('calls sendSMS with newMessage template when recipient has a phone number', async () => {
    (supabaseAdmin as any).single
      // messages.insert().select().single() → inserted row
      .mockResolvedValueOnce({
        data: {
          id: 'msg-001',
          sender_id: 'user-456',
          recipient_id: 'op-999',
          content: 'Hello',
          request_id: 'req-123',
          booking_id: null,
        },
        error: null,
      })
      // unified_profiles → sender display info
      .mockResolvedValueOnce({
        data: { id: 'user-456', full_name: 'Test User', avatar_url: null, role: 'customer' },
        error: null,
      })
      // unified_profiles → recipient phone
      .mockResolvedValueOnce({ data: { phone: '5559876543' }, error: null });

    const req = new NextRequest('https://businto.com/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        request_id: 'req-123',
        booking_id: null,
        sender_id: 'user-456',
        recipient_id: 'op-999',
        content: 'Hello, is the bus ready?',
      }),
    });

    const response = await messagesPOST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(sendSMS).toHaveBeenCalledWith(expect.objectContaining({ to: '5559876543' }));
    expect(smsTemplates.newMessage).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-123' })
    );
  });

  it('does not call sendSMS when recipient has no phone number', async () => {
    (supabaseAdmin as any).single
      .mockResolvedValueOnce({
        data: {
          id: 'msg-002',
          sender_id: 'user-456',
          recipient_id: 'op-999',
          content: 'Hi',
          request_id: 'req-456',
          booking_id: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: 'user-456', full_name: 'Test User', avatar_url: null, role: 'customer' },
        error: null,
      })
      .mockResolvedValueOnce({ data: { phone: null }, error: null });

    const req = new NextRequest('https://businto.com/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        request_id: 'req-456',
        booking_id: null,
        sender_id: 'user-456',
        recipient_id: 'op-999',
        content: 'Hi there',
      }),
    });

    const response = await messagesPOST(req);
    expect(response.status).toBe(200);
    expect(sendSMS).not.toHaveBeenCalled();
  });
});
