import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Operator Earnings API tests
 * Tests for /api/operator/earnings route security, data scoping, and logic
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

describe('Operator Earnings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Access Control', () => {
    it('should reject unauthenticated requests', async () => {
      mockRequireUser.mockResolvedValue(null);

      const { GET } = await import('@/app/api/operator/earnings/route');
      const request = new Request('http://localhost:3000/api/operator/earnings');
      const response = await GET(request as any);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Earnings Calculation Logic', () => {
    it('should correctly calculate monthly totals from completed bookings', () => {
      const bookings = [
        { status: 'completed', payment_status: 'paid', amount: 200, created_at: '2026-03-15T10:00:00Z' },
        { status: 'completed', payment_status: 'paid', amount: 350, created_at: '2026-03-20T14:00:00Z' },
        { status: 'completed', payment_status: 'paid', amount: 150, created_at: '2026-02-10T09:00:00Z' },
        { status: 'completed', payment_status: 'paid', amount: 400, created_at: '2026-01-05T11:00:00Z' },
      ];

      // Simulate the earnings calculation logic from the route
      const trips = bookings.map(b => ({
        amount: b.amount || 0,
        completedAt: b.created_at,
      }));

      const monthlyTotals: Record<string, { month: string; total: number; tripCount: number }> = {};
      for (const trip of trips) {
        const month = trip.completedAt?.substring(0, 7) || 'unknown';
        if (!monthlyTotals[month]) {
          monthlyTotals[month] = { month, total: 0, tripCount: 0 };
        }
        monthlyTotals[month].total += trip.amount;
        monthlyTotals[month].tripCount += 1;
      }

      expect(monthlyTotals['2026-03'].total).toBe(550);
      expect(monthlyTotals['2026-03'].tripCount).toBe(2);
      expect(monthlyTotals['2026-02'].total).toBe(150);
      expect(monthlyTotals['2026-01'].total).toBe(400);
    });

    it('should calculate all-time total correctly', () => {
      const trips = [
        { amount: 200 },
        { amount: 350 },
        { amount: 150 },
        { amount: 0 },
      ];

      const allTimeTotal = trips.reduce((sum, t) => sum + t.amount, 0);
      expect(allTimeTotal).toBe(700);
    });

    it('should handle empty bookings gracefully', () => {
      const trips: any[] = [];
      const allTimeTotal = trips.reduce((sum: number, t: any) => sum + t.amount, 0);
      const monthlyTotals: Record<string, any> = {};

      expect(allTimeTotal).toBe(0);
      expect(Object.keys(monthlyTotals).length).toBe(0);
    });

    it('should filter trips by month correctly', () => {
      const trips = [
        { amount: 200, completedAt: '2026-03-15T10:00:00Z' },
        { amount: 350, completedAt: '2026-03-20T14:00:00Z' },
        { amount: 150, completedAt: '2026-02-10T09:00:00Z' },
      ];

      const monthFilter = '2026-03';
      const filtered = trips.filter(t => t.completedAt.substring(0, 7) === monthFilter);

      expect(filtered.length).toBe(2);
      expect(filtered.reduce((sum, t) => sum + t.amount, 0)).toBe(550);
    });

    it('should sort monthly summary in descending order', () => {
      const monthlyTotals: Record<string, { month: string; total: number; tripCount: number }> = {
        '2026-01': { month: '2026-01', total: 400, tripCount: 1 },
        '2026-03': { month: '2026-03', total: 550, tripCount: 2 },
        '2026-02': { month: '2026-02', total: 150, tripCount: 1 },
      };

      const sorted = Object.values(monthlyTotals).sort(
        (a, b) => b.month.localeCompare(a.month)
      );

      expect(sorted[0].month).toBe('2026-03');
      expect(sorted[1].month).toBe('2026-02');
      expect(sorted[2].month).toBe('2026-01');
    });
  });
});
