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
  emailTemplates: {
    bookingConfirmation: vi.fn().mockReturnValue({ subject: 'User Sub', html: 'User HTML' }),
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
      .mockResolvedValueOnce({ data: { id: mockRequestId, status: 'pending', user_id: mockUserId }, error: null }) // 1. request
      .mockResolvedValueOnce({ // 3. quote details
        data: { 
          id: mockQuoteId, 
          operator_id: 'op-999', 
          total_price: 100, 
          vehicle_type: 'Van',
          operator: { email: mockOperatorEmail, company_name: 'Fast Trans' } 
        }, 
        error: null 
      })
      .mockResolvedValueOnce({ // 4. full request
        data: { id: mockRequestId, pickup_address: '123 Main St', start_date: '2026-03-01', metadata_private: { parent_name: 'Parent Name' } },
        error: null
      })
      .mockResolvedValueOnce({ // 8. booking
        data: { id: 'booking-001', confirmation_code: 'BUS-123' },
        error: null
      })
      .mockResolvedValueOnce({ // 10. parent profile
        data: { email: 'parent@test.com', full_name: 'Parent Name', phone: '555-0000' },
        error: null
      })
      .mockResolvedValueOnce({ // 11. user profile
        data: { email: 'user@test.com', full_name: 'User Name' },
        error: null
      });

    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null }); // 2. no existing accepted quote

    // 3. Execute the API Route handler
    const request = new NextRequest('https://businto.com/api/quotes/accept', {
      method: 'POST',
      body: JSON.stringify({
        quoteId: mockQuoteId,
        tripRequestId: mockRequestId,
        userId: mockUserId
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    // 4. Assertions
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    // CRITICAL VERIFICATION: Did the operator receive the PII Reveal email?
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: mockOperatorEmail,
        subject: expect.stringContaining('Booking Confirmed'),
        html: expect.stringContaining('Parent Name') // PII Reveal from metadata_private
      })
    );

    console.log('✅ TEST PASSED: Operator correctly received the confirmation email with PII data.');
  });
});
