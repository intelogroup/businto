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
    rpc: vi.fn(),
  };

  mock.from.mockReturnValue(mock);
  mock.select.mockReturnValue(mock);
  mock.eq.mockReturnValue(mock);
  mock.neq.mockReturnValue(mock);
  mock.update.mockReturnValue(mock);
  mock.insert.mockReturnValue(mock);
  mock.order.mockReturnValue(mock);
  // Make mock thenable so .then() calls work (for fire-and-forget notifications)
  mock.then = vi.fn((resolve: any) => resolve({ data: null, error: null }));

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
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-456', email_confirmed_at: '2025-01-01T00:00:00Z' } } }),
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
    const mockOperatorEmail = 'operator@test.com';

    // Using the imported supabaseAdmin which is actually our mock
    const mockSupabase = supabaseAdmin as any;

    // Mock the atomic RPC call — returns success with booking details
    mockSupabase.rpc.mockResolvedValue({
      data: {
        success: true,
        booking_id: 'booking-001',
        confirmation_code: 'BUS-123',
        operator_id: 'op-999',
        total_price: 100,
        vehicle_type: 'Van',
        declined_operator_ids: [],
      },
      error: null,
    });

    // Mock post-transaction DB queries for email sending
    mockSupabase.single
      // 1. transport_requests — full request with userProfile JOIN (for email)
      .mockResolvedValueOnce({
        data: {
          id: mockRequestId,
          pickup_address: '123 Main St',
          pickup_fuzzy: '123 Main',
          dropoff_address: '456 School Ave',
          start_date: '2026-03-01',
          start_time: '08:00',
          metadata_private: { parent_name: 'Parent Name' },
          userProfile: { email: 'parent@test.com', full_name: 'Parent Name', phone: '555-0000' }
        },
        error: null
      })
      // 2. quotes — quote details with operator join (for email)
      .mockResolvedValueOnce({
        data: {
          id: mockQuoteId,
          operator_id: 'op-999',
          total_price: 100,
          vehicle_type: 'Van',
          operator: { company_email: mockOperatorEmail, company_name: 'Fast Trans' }
        },
        error: null
      });

    // Ownership lookup: this request belongs to the session user (user-456).
    mockSupabase.maybeSingle.mockResolvedValue({ data: { user_id: 'user-456' }, error: null });

    // 3. Execute the API Route handler
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
    expect(body.bookingId).toBe('booking-001');
    expect(body.confirmationCode).toBe('BUS-123');

    // VERIFICATION: RPC was called with correct parameters
    expect(mockSupabase.rpc).toHaveBeenCalledWith('accept_quote_atomic', {
      p_quote_id: mockQuoteId,
      p_request_id: mockRequestId,
      p_user_id: 'user-456',
      p_is_manual_mode: false,
    });

    // VERIFICATION: Did the user receive the booking confirmation?
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
