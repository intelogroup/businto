import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Operator Dashboard API tests
 * Tests for /api/operator/dashboard route security and data scoping
 */

const mockRequireUser = vi.fn();

vi.mock('@/lib/supabase-server', () => {
  const chainMock = (resolvedData: any = null) => {
    const chain: any = {
      select: vi.fn().mockReturnValue(chain),
      eq: vi.fn().mockReturnValue(chain),
      order: vi.fn().mockReturnValue(chain),
      limit: vi.fn().mockResolvedValue({ data: resolvedData, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: resolvedData, error: null }),
      single: vi.fn().mockResolvedValue({ data: resolvedData, error: null }),
      filter: vi.fn().mockReturnValue(chain),
    };
    return chain;
  };

  return {
    supabaseAdmin: {
      from: vi.fn().mockImplementation(() => chainMock()),
    },
    requireUser: mockRequireUser,
  };
});

describe('Operator Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module cache so each test gets a fresh import
    vi.resetModules();
  });

  describe('Access Control', () => {
    it('should reject unauthenticated requests', async () => {
      mockRequireUser.mockResolvedValue(null);

      const { GET } = await import('@/app/api/operator/dashboard/route');
      const request = new Request('http://localhost:3000/api/operator/dashboard');
      const response = await GET(request as any);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Booking Timeline Logic', () => {
    // Test the earnings calculation logic independently
    it('should only count completed+paid bookings for earnings', () => {
      const bookings = [
        { status: 'completed', payment_status: 'paid', amount: 200 },
        { status: 'completed', payment_status: 'paid', amount: 300 },
        { status: 'confirmed', payment_status: 'pending', amount: 150 },
        { status: 'cancelled', payment_status: 'refunded', amount: 100 },
      ];

      const completedBookings = bookings.filter(
        b => b.status === 'completed' && b.payment_status === 'paid'
      );
      const totalEarnings = completedBookings.reduce((sum, b) => sum + (b.amount || 0), 0);
      const activeBookings = bookings.filter(b => ['confirmed', 'in_progress'].includes(b.status));

      expect(totalEarnings).toBe(500);
      expect(completedBookings.length).toBe(2);
      expect(activeBookings.length).toBe(1);
    });

    it('should correctly categorize quotes by status', () => {
      const quotes = [
        { id: 'q1', status: 'pending', total_price: 100 },
        { id: 'q2', status: 'accepted', total_price: 200 },
        { id: 'q3', status: 'declined', total_price: 150 },
        { id: 'q4', status: 'pending', total_price: 250 },
      ];

      const pendingQuotes = quotes.filter(q => q.status === 'pending');
      const acceptedQuotes = quotes.filter(q => q.status === 'accepted');

      expect(pendingQuotes.length).toBe(2);
      expect(acceptedQuotes.length).toBe(1);
      expect(quotes.length).toBe(4);
    });
  });
});
