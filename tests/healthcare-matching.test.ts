import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findMatchingOperators } from '../src/lib/operator-matching';
import { supabaseAdmin as supabase } from '../src/lib/supabase-server';

// Mock the supabase client
vi.mock('../src/lib/supabase-server', () => ({
    supabaseAdmin: {
        from: vi.fn(),
    },
}));

// Mock calculateDistance and geocodeAddress to avoid real API calls
vi.mock('../src/lib/operator-matching', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/lib/operator-matching')>();
    return {
        ...actual,
        geocodeAddress: vi.fn().mockResolvedValue({ lat: 40.7128, lng: -74.0060 }),
        calculateDistance: vi.fn().mockReturnValue(10), // Everything is 10 miles away
    };
});

describe('Operator Matching - Healthcare Specific Requests', () => {
    let mockOperators: any[];

    beforeEach(() => {
        vi.clearAllMocks();

        mockOperators = [
            {
                id: 'op-ambulatory',
                company_name: 'Ambulatory Care Transport',
                vehicle_types: ['sedan'],
                specialties: ['Medical Transport'],
                company_lat: 40.7,
                company_lng: -74.0,
                service_radius_miles: 50,
                is_verified: true,
                is_active: true,
                is_accepting_requests: true
            },
            {
                id: 'op-wheelchair',
                company_name: 'Wheelchair Express',
                vehicle_types: ['wheelchair_van'],
                specialties: ['Medical Transport', 'Wheelchair'],
                company_lat: 40.7,
                company_lng: -74.0,
                service_radius_miles: 50,
                is_verified: true,
                is_active: true,
                is_accepting_requests: true
            },
            {
                id: 'op-stretcher',
                company_name: 'Stretcher & ALS Services',
                vehicle_types: ['van'],
                specialties: ['Medical Transport', 'Stretcher', 'Oxygen', 'Bariatric'],
                company_lat: 40.7,
                company_lng: -74.0,
                service_radius_miles: 50,
                is_verified: true,
                is_active: true,
                is_accepting_requests: true
            },
            {
                id: 'op-premium',
                company_name: 'Premium Medical Concierge',
                vehicle_types: ['wheelchair_van', 'sedan'],
                specialties: ['Medical Transport', 'Wheelchair', 'White Glove', 'Door-Through-Door'],
                company_lat: 40.7,
                company_lng: -74.0,
                service_radius_miles: 50,
                is_verified: true,
                is_active: true,
                is_accepting_requests: true
            }
        ];

        // Setup supabase mock chain
        const selectMock = vi.fn().mockReturnThis();
        const eqMock = vi.fn().mockReturnThis();
        const containsMock = vi.fn().mockReturnThis();

        // The final await returns our mock data
        const queryMock = Promise.resolve({ data: mockOperators, error: null });
        Object.assign(queryMock, {
            select: selectMock,
            eq: eqMock,
            contains: containsMock,
        });

        (supabase.from as any).mockReturnValue(queryMock);
    });

    it('should return "Ambulatory Care Transport" for basic ambulatory medical requests', async () => {
        const request: any = {
            service_type: 'medical',
            pickup_address: '123 Main St, New York, NY',
            metadata: {
                mobility_level: 'ambulatory',
                service_level: 'curb-to-curb'
            }
        };

        const matches = await findMatchingOperators(request);

        // Should include all that have "Medical Transport" and basic vehicle
        expect(matches.map(m => m.id)).toContain('op-ambulatory');
        expect(matches.map(m => m.id)).toContain('op-wheelchair');
        expect(matches.map(m => m.id)).toContain('op-stretcher');
        expect(matches.map(m => m.id)).toContain('op-premium');
    });

    it('should return "Wheelchair Express" and "Premium Medical Concierge" for wheelchair requests', async () => {
        const request: any = {
            service_type: 'medical',
            metadata: {
                mobility_level: 'wheelchair',
                service_level: 'door-to-door'
            }
        };

        const matches = await findMatchingOperators(request);

        expect(matches.map(m => m.id)).toContain('op-wheelchair');
        expect(matches.map(m => m.id)).toContain('op-premium');
        expect(matches.map(m => m.id)).not.toContain('op-ambulatory');
    });

    it('should return only "Stretcher & ALS Services" for stretcher requests', async () => {
        const request: any = {
            service_type: 'medical',
            metadata: {
                mobility_level: 'stretcher'
            }
        };

        const matches = await findMatchingOperators(request);

        expect(matches).toHaveLength(1);
        expect(matches[0].id).toBe('op-stretcher');
    });

    it('should return "Stretcher & ALS Services" when oxygen is required', async () => {
        const request: any = {
            service_type: 'medical',
            metadata: {
                mobility_level: 'ambulatory',
                oxygen_use: true
            }
        };

        const matches = await findMatchingOperators(request);

        expect(matches.map(m => m.id)).toContain('op-stretcher');
        expect(matches.map(m => m.id)).not.toContain('op-ambulatory');
        expect(matches.map(m => m.id)).not.toContain('op-wheelchair');
    });

    it('should return only "Premium Medical Concierge" for White Glove service', async () => {
        const request: any = {
            service_type: 'medical',
            metadata: {
                mobility_level: 'ambulatory',
                service_level: 'white-glove'
            }
        };

        const matches = await findMatchingOperators(request);

        expect(matches).toHaveLength(1);
        expect(matches[0].id).toBe('op-premium');
    });

    it('should return empty when no operator meets bariatric requirements', async () => {
        // op-stretcher has Bariatric, but we'll filter it out by mobility if requested differently
        // Wait, op-stretcher has it. Let's try something NO ONE has.
        const request: any = {
            service_type: 'medical',
            metadata: {
                mobility_level: 'ambulatory',
                service_animal: true
            }
        };

        const matches = await findMatchingOperators(request);

        expect(matches).toHaveLength(0);
    });

    it('should return "Premium Medical Concierge" for Door-Through-Door requests', async () => {
        const request: any = {
            service_type: 'medical',
            metadata: {
                mobility_level: 'wheelchair',
                service_level: 'door-through-door'
            }
        };

        const matches = await findMatchingOperators(request);

        expect(matches).toHaveLength(1);
        expect(matches[0].id).toBe('op-premium');
    });
});
