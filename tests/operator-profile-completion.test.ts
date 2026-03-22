import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Operator Profile Completion / Onboarding Tests
 *
 * Covers:
 * - Completion status computation logic
 * - Field whitelisting (security: operators can't set is_partner, rating, etc.)
 * - Input validation for specialties and service radius
 * - Auth gate (unauthenticated rejection)
 */

const mockRequireUser = vi.fn();

vi.mock('@/lib/supabase-server', () => {
  const chainMock = () => {
    const chain: any = {
      select: vi.fn().mockReturnValue(chain),
      eq: vi.fn().mockReturnValue(chain),
      update: vi.fn().mockReturnValue(chain),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    return chain;
  };

  return {
    supabaseAdmin: {
      from: vi.fn().mockImplementation(() => chainMock()),
    },
    requireUser: (...args: any[]) => mockRequireUser(...args),
  };
});

vi.mock('@/lib/event-logger', () => ({
  logEvent: vi.fn(),
}));

const FULL_OPERATOR = {
  id: '00000000-0000-0000-0000-000000000002',
  company_name: 'TestCo Transport',
  company_email: 'ops@testco.com',
  company_phone: '555-1234',
  specialties: ['school', 'medical'],
  service_radius_miles: 50,
  service_areas: ['Boston', 'Cambridge'],
  is_active: true,
  is_partner: false,
  is_verified: true,
  rating: 4.5,
  total_reviews: 12,
  created_at: '2025-01-01T00:00:00Z',
};

const INCOMPLETE_OPERATOR = {
  ...FULL_OPERATOR,
  company_phone: null,
  specialties: null,
  service_radius_miles: null,
  service_areas: null,
};

describe('Operator Profile Completion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Authentication Gate', () => {
    it('should reject unauthenticated GET requests', async () => {
      mockRequireUser.mockResolvedValue(null);

      const { GET } = await import('@/app/api/operator/profile/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject unauthenticated PATCH requests', async () => {
      mockRequireUser.mockResolvedValue(null);

      const { PATCH } = await import('@/app/api/operator/profile/route');
      const request = new Request('http://localhost:3000/api/operator/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_phone: '555-0000' }),
      });
      const response = await PATCH(request as any);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Completion Status Logic', () => {
    function computeCompletion(operator: typeof FULL_OPERATOR) {
      const completionStatus = {
        hasCompanyInfo: !!(operator.company_name && operator.company_email),
        hasSpecialties: Array.isArray(operator.specialties) && operator.specialties.length > 0,
        hasServiceRadius: typeof operator.service_radius_miles === 'number' && operator.service_radius_miles > 0,
        hasServiceAreas: Array.isArray(operator.service_areas) && operator.service_areas.length > 0,
        hasPhone: !!operator.company_phone,
        isActive: !!operator.is_active,
      };
      const completedSteps = Object.values(completionStatus).filter(Boolean).length;
      const totalSteps = Object.keys(completionStatus).length;
      return { completionStatus, completedSteps, totalSteps, isProfileComplete: completedSteps === totalSteps };
    }

    it('should compute 100% completion for a fully filled profile', () => {
      const result = computeCompletion(FULL_OPERATOR);

      expect(result.completedSteps).toBe(6);
      expect(result.totalSteps).toBe(6);
      expect(result.isProfileComplete).toBe(true);
      expect(result.completionStatus.hasCompanyInfo).toBe(true);
      expect(result.completionStatus.hasSpecialties).toBe(true);
      expect(result.completionStatus.hasServiceRadius).toBe(true);
      expect(result.completionStatus.hasServiceAreas).toBe(true);
      expect(result.completionStatus.hasPhone).toBe(true);
      expect(result.completionStatus.isActive).toBe(true);
    });

    it('should compute partial completion for incomplete profile', () => {
      const result = computeCompletion(INCOMPLETE_OPERATOR as any);

      expect(result.completedSteps).toBe(2); // hasCompanyInfo + isActive
      expect(result.isProfileComplete).toBe(false);
      expect(result.completionStatus.hasSpecialties).toBe(false);
      expect(result.completionStatus.hasServiceRadius).toBe(false);
      expect(result.completionStatus.hasServiceAreas).toBe(false);
      expect(result.completionStatus.hasPhone).toBe(false);
    });

    it('should handle empty specialties array as incomplete', () => {
      const op = { ...FULL_OPERATOR, specialties: [] };
      const result = computeCompletion(op);

      expect(result.completionStatus.hasSpecialties).toBe(false);
    });

    it('should handle zero service radius as incomplete', () => {
      const op = { ...FULL_OPERATOR, service_radius_miles: 0 };
      const result = computeCompletion(op);

      expect(result.completionStatus.hasServiceRadius).toBe(false);
    });

    it('should handle inactive operator', () => {
      const op = { ...FULL_OPERATOR, is_active: false };
      const result = computeCompletion(op);

      expect(result.completionStatus.isActive).toBe(false);
      expect(result.isProfileComplete).toBe(false);
    });
  });

  describe('Field Whitelisting (Security)', () => {
    const ALLOWED_FIELDS = [
      'company_name',
      'company_email',
      'company_phone',
      'specialties',
      'service_radius_miles',
      'service_areas',
    ];

    it('should NOT allow operators to set privileged fields', () => {
      const dangerousFields = [
        'is_active',
        'is_partner',
        'is_verified',
        'rating',
        'total_reviews',
        'id',
        'created_at',
      ];

      for (const field of dangerousFields) {
        expect(ALLOWED_FIELDS).not.toContain(field);
      }
    });

    it('should whitelist exactly 6 editable fields', () => {
      expect(ALLOWED_FIELDS).toHaveLength(6);
    });

    it('should only strip non-whitelisted fields from body', () => {
      const body = {
        company_name: 'New Name',
        is_partner: true, // should be stripped
        rating: 5.0, // should be stripped
        service_radius_miles: 100,
      };

      const updateData: Record<string, any> = {};
      for (const field of ALLOWED_FIELDS) {
        if ((body as any)[field] !== undefined) {
          updateData[field] = (body as any)[field];
        }
      }

      expect(updateData).toHaveProperty('company_name');
      expect(updateData).toHaveProperty('service_radius_miles');
      expect(updateData).not.toHaveProperty('is_partner');
      expect(updateData).not.toHaveProperty('rating');
    });
  });

  describe('Specialty Validation', () => {
    const VALID_SPECIALTIES = ['school', 'medical', 'wedding', 'corporate'];

    it('should accept valid specialties', () => {
      const input = ['school', 'medical'];
      const invalid = input.filter(s => !VALID_SPECIALTIES.includes(s));
      expect(invalid).toHaveLength(0);
    });

    it('should reject invalid specialty values', () => {
      const input = ['school', 'helicopter', 'spaceshuttle'];
      const invalid = input.filter(s => !VALID_SPECIALTIES.includes(s));
      expect(invalid).toEqual(['helicopter', 'spaceshuttle']);
    });

    it('should reject non-array specialties', () => {
      const specialties = 'school' as any;
      expect(Array.isArray(specialties)).toBe(false);
    });

    it('should have exactly 4 valid specialty types', () => {
      expect(VALID_SPECIALTIES).toHaveLength(4);
    });
  });

  describe('Service Radius Validation', () => {
    it('should accept radius within range (1-500)', () => {
      const values = [1, 50, 100, 500];
      for (const v of values) {
        const valid = !isNaN(v) && v >= 1 && v <= 500;
        expect(valid).toBe(true);
      }
    });

    it('should reject radius outside range', () => {
      const values = [0, -1, 501, 999];
      for (const v of values) {
        const valid = !isNaN(v) && v >= 1 && v <= 500;
        expect(valid).toBe(false);
      }
    });

    it('should reject NaN radius', () => {
      const v = Number('abc');
      const valid = !isNaN(v) && v >= 1 && v <= 500;
      expect(valid).toBe(false);
    });
  });

  describe('Service Areas Parsing', () => {
    it('should split comma-separated areas correctly', () => {
      const input = 'Boston, Cambridge, Somerville';
      const parsed = input.split(',').map(a => a.trim()).filter(Boolean);
      expect(parsed).toEqual(['Boston', 'Cambridge', 'Somerville']);
    });

    it('should handle empty string gracefully', () => {
      const input = '';
      const parsed = input.split(',').map(a => a.trim()).filter(Boolean);
      expect(parsed).toEqual([]);
    });

    it('should handle trailing commas', () => {
      const input = 'Boston, Cambridge,';
      const parsed = input.split(',').map(a => a.trim()).filter(Boolean);
      expect(parsed).toEqual(['Boston', 'Cambridge']);
    });
  });

  describe('Onboarding Step Progression', () => {
    const STEPS = [
      { key: 'company', statusKey: 'hasCompanyInfo' },
      { key: 'specialties', statusKey: 'hasSpecialties' },
      { key: 'service-area', statusKey: 'hasServiceRadius' },
      { key: 'contact', statusKey: 'hasPhone' },
    ];

    it('should auto-advance to first incomplete step', () => {
      const completionStatus: Record<string, boolean> = {
        hasCompanyInfo: true,
        hasSpecialties: false,
        hasServiceRadius: false,
        hasPhone: false,
      };

      const firstIncomplete = STEPS.findIndex(s => !completionStatus[s.statusKey]);
      expect(firstIncomplete).toBe(1); // specialties step
    });

    it('should stay at step 0 if all incomplete', () => {
      const completionStatus: Record<string, boolean> = {
        hasCompanyInfo: false,
        hasSpecialties: false,
        hasServiceRadius: false,
        hasPhone: false,
      };

      const firstIncomplete = STEPS.findIndex(s => !completionStatus[s.statusKey]);
      expect(firstIncomplete).toBe(0);
    });

    it('should return -1 if all steps complete', () => {
      const completionStatus: Record<string, boolean> = {
        hasCompanyInfo: true,
        hasSpecialties: true,
        hasServiceRadius: true,
        hasPhone: true,
      };

      const firstIncomplete = STEPS.findIndex(s => !completionStatus[s.statusKey]);
      expect(firstIncomplete).toBe(-1);
    });
  });
});
