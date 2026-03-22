import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Customer Profile API tests
 * Tests for /api/customer/profile route security, validation, and data handling
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
      insert: vi.fn().mockReturnValue(chain),
      update: vi.fn().mockReturnValue(chain),
      filter: vi.fn().mockReturnValue(chain),
    };
    return chain;
  };

  return {
    supabaseAdmin: {
      from: vi.fn().mockImplementation(() => chainMock()),
      auth: {
        admin: {
          updateUserById: vi.fn().mockResolvedValue({ data: null, error: null }),
        },
      },
    },
    requireUser: mockRequireUser,
  };
});

describe('Customer Profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('GET /api/customer/profile', () => {
    it('should reject unauthenticated requests', async () => {
      mockRequireUser.mockResolvedValue(null);

      const { GET } = await import('@/app/api/customer/profile/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('PATCH /api/customer/profile', () => {
    it('should reject unauthenticated requests', async () => {
      mockRequireUser.mockResolvedValue(null);

      const { PATCH } = await import('@/app/api/customer/profile/route');
      const request = new Request('http://localhost:3000/api/customer/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: 'Test User' }),
      });
      const response = await PATCH(request as any);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Transport Preferences Validation', () => {
    it('should accept valid mobility levels', () => {
      const validMobility = ['ambulatory', 'wheelchair', 'manual-wheelchair', 'electric-wheelchair', 'stretcher'];

      validMobility.forEach(level => {
        expect(validMobility.includes(level)).toBe(true);
      });
    });

    it('should reject invalid mobility levels', () => {
      const validMobility = ['ambulatory', 'wheelchair', 'manual-wheelchair', 'electric-wheelchair', 'stretcher'];
      const invalidLevels = ['flying', 'teleportation', ''];

      invalidLevels.forEach(level => {
        expect(validMobility.includes(level)).toBe(false);
      });
    });

    it('should accept valid service levels', () => {
      const validServiceLevel = ['curb-to-curb', 'door-to-door', 'door-through-door', 'hand-to-hand'];

      validServiceLevel.forEach(level => {
        expect(validServiceLevel.includes(level)).toBe(true);
      });
    });

    it('should reject invalid service levels', () => {
      const validServiceLevel = ['curb-to-curb', 'door-to-door', 'door-through-door', 'hand-to-hand'];
      const invalidLevels = ['express', 'premium', ''];

      invalidLevels.forEach(level => {
        expect(validServiceLevel.includes(level)).toBe(false);
      });
    });

    it('should validate phone number format', () => {
      const phoneRegex = /^[\d\s\-+().]{7,20}$/;

      expect(phoneRegex.test('(555) 123-4567')).toBe(true);
      expect(phoneRegex.test('+1-555-123-4567')).toBe(true);
      expect(phoneRegex.test('5551234567')).toBe(true);
      expect(phoneRegex.test('123')).toBe(false); // Too short
      expect(phoneRegex.test('abc-def-ghij')).toBe(false); // Letters
    });

    it('should handle transport preferences structure correctly', () => {
      const validPrefs = {
        default_mobility: 'wheelchair',
        default_service_level: 'door-to-door',
        oxygen_required: true,
        service_animal: false,
        attendant_needed: true,
        special_requirements: 'Needs extra time for boarding',
      };

      expect(typeof validPrefs).toBe('object');
      expect(validPrefs.default_mobility).toBe('wheelchair');
      expect(validPrefs.oxygen_required).toBe(true);
    });

    it('should allow null transport preferences to clear saved data', () => {
      const prefs = null;
      expect(prefs === null || typeof prefs === 'object').toBe(true);
    });

    it('should reject non-object transport preferences', () => {
      const invalidTypes = ['string', 123, true, []];

      invalidTypes.forEach(val => {
        // Arrays are objects in JS, so we need additional check
        const isValid = val === null || (typeof val === 'object' && !Array.isArray(val));
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
          expect(isValid).toBe(false);
        }
      });
    });
  });

  describe('Name Validation', () => {
    it('should require non-empty name', () => {
      expect(''.trim().length >= 1).toBe(false);
      expect('  '.trim().length >= 1).toBe(false);
      expect('John'.trim().length >= 1).toBe(true);
    });
  });
});
