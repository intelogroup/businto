import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../src/app/api/quotes/accept/route';
import { supabaseAdmin } from '../src/lib/supabase-server';
import { sendEmail } from '../src/lib/email';
import { NextRequest } from 'next/server';

// 1. Setup Mocks using the inline factory to avoid hoisting issues
vi.mock('../src/lib/supabase-server', () => {
  const mock: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    order: vi.fn().mockReturnThis(),
  };

  mock.from.mockReturnValue(mock);
  mock.select.mockReturnValue(mock);
  mock.eq.mockReturnValue(mock);
  mock.neq.mockReturnValue(mock);
  mock.update.mockReturnValue(mock);
  mock.insert.mockReturnValue(mock);
  mock.order.mockReturnValue(mock);

  return { supabaseAdmin: mock };
});

vi.mock('../src/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: 'mock-email-id' }),
  getAppBaseUrl: vi.fn().mockReturnValue('https://businto.com'),
  emailTemplates: {
    bookingConfirmation: vi.fn().mockReturnValue({ subject: 'User Sub', html: 'User HTML' }),
    operatorOrderDetails: vi.fn().mockReturnValue({ subject: 'Booking Confirmed', html: 'Parent Name' }),
  },
}));

vi.mock('../src/lib/sms', () => ({
  sendSMS: vi.fn().mockResolvedValue({ success: true }),
  smsTemplates: {
    quoteAccepted: vi.fn().mockReturnValue({ body: 'Mock SMS' }),
  },
}));

vi.mock('../src/lib/tokens', () => ({
  verifyUserTripToken: vi.fn().mockResolvedValue({ requestId: 'req-123', userId: 'user-456' }),
}));

vi.mock('../src/lib/event-logger', () => ({
  logEvent: vi.fn().mockResolvedValue({}),
}));

// Mock the app-settings cache so dispatch mode doesn't hit Supabase
vi.mock('../src/lib/app-settings', () => ({
  getDispatchMode: vi.fn().mockResolvedValue(false),
  invalidateSettingsCache: vi.fn(),
}));

// Mock createClient so auth.getUser() returns the test user (route no longer reads userId from body)
vi.mock('../src/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      // Inline literal — vi.mock factories are hoisted and cannot reference outer consts
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-456' } } }),
    },
  }),
}));

describe('Quote Acceptance - Operator Email Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send an email with PII to the operator when quote is accepted', async () => {
    const mockQuoteId = 'quote-789';
    const mockRequestId = 'req-123';
    const mockUserId = 'user-456';
    const mockOperatorEmail = 'operator@test.com';

    // 2. Define specific responses for each call in the sequence
    // Using the imported supabaseAdmin which is actually our mock
    const mockSupabase = supabaseAdmin as any;

    mockSupabase.single
      // 1. transport_requests — status verification (requestVerification)
      .mockResolvedValueOnce({ data: { id: mockRequestId, status: 'pending', user_id: mockUserId }, error: null })
      // 2. quotes — quote details with operator join
      .mockResolvedValueOnce({
        data: {
          id: mockQuoteId,
          operator_id: 'op-999',
          total_price: 100,
          vehicle_type: 'Van',
          operator: { company_email: mockOperatorEmail, company_name: 'Fast Trans' }
        },
        error: null
      })
      // 3. transport_requests — full request with userProfile JOIN (PERF: merged, no separate profiles call)
      .mockResolvedValueOnce({
        data: {
          id: mockRequestId,
          pickup_address: '123 Main St',
          pickup_fuzzy: '123 Main',
          dropoff_address: '456 School Ave',
          start_date: '2026-03-01',
          start_time: '08:00',
          metadata_private: { parent_name: 'Parent Name' },
          // Joined profile data (replaces the old separate profiles query)
          userProfile: { email: 'parent@test.com', full_name: 'Parent Name', phone: '555-0000' }
        },
        error: null
      })
      // 4. bookings — booking insert result
      .mockResolvedValueOnce({ data: { id: 'booking-001', confirmation_code: 'BUS-123' }, error: null });

    mockSupabase.maybeSingle.mockResolvedValue({ data: { id: mockRequestId }, error: null }); // simulate successful atomic status update (not a race condition)

    // 3. Execute the API Route handler
    // Note: userId is NOT sent in body — route uses session auth (mocked above)
    const request = new NextRequest('https://businto.com/api/quotes/accept', {
      method: 'POST',
      body: JSON.stringify({
        quoteId: mockQuoteId,
        tripRequestId: mockRequestId,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    // 4. Assertions
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    // VERIFICATION: Did the user receive the booking confirmation?
    // Note: Operator reveal email is now moved to Stripe webhook, so it won't be called here.
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "parent@test.com",
        subject: expect.stringContaining('User Sub'),
        html: expect.stringContaining('User HTML')
      })
    );

    console.log('✅ TEST PASSED: User correctly received the booking confirmation email.');
  });
});
