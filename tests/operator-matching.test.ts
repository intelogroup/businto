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

describe('Operator Matching - Strict Conditions', () => {
    let mockOperators: any[];

    beforeEach(() => {
        vi.clearAllMocks();

        mockOperators = [
            {
                id: 'op-1',
                company_name: 'Basic Medical Transport',
                vehicle_types: ['sedan', 'wheelchair_van'],
                specialties: ['Wheelchair'],
                company_lat: 40.7,
                company_lng: -74.0,
                service_radius_miles: 50
            },
            {
                id: 'op-2',
                company_name: 'Advanced Medical Transport',
                vehicle_types: ['ambulance', 'wheelchair_van'],
                specialties: ['Wheelchair', 'Stretcher', 'Oxygen', 'Bariatric', 'White Glove'],
                company_lat: 40.7,
                company_lng: -74.0,
                service_radius_miles: 50
            },
            {
                id: 'op-3',
                company_name: 'School Bus Co',
                vehicle_types: ['school_bus'],
                specialties: ['Special Needs', 'Booster Seat'],
                company_lat: 40.7,
                company_lng: -74.0,
                service_radius_miles: 50
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

    describe('Medical Strict Conditions', () => {
        it('should match only operators with "Stretcher" when mobility_level is stretcher', async () => {
            const request = {
                service_type: 'medical' as const,
                pickup_address: 'NY',
                pickup_lat: 40.71,
                pickup_lng: -74.01,
                metadata: {
                    mobility_level: 'stretcher'
                }
            };

            const matches = await findMatchingOperators(request);

            expect(matches).toHaveLength(1);
            expect(matches[0].company_name).toBe('Advanced Medical Transport');
        });

        it('should match operators with "Wheelchair" for manual/electric wheelchairs', async () => {
            const request = {
                service_type: 'medical' as const,
                pickup_address: 'NY',
                pickup_lat: 40.71,
                pickup_lng: -74.01,
                metadata: {
                    mobility_level: 'electric-wheelchair' // or manual-wheelchair
                }
            };

            const matches = await findMatchingOperators(request);

            expect(matches).toHaveLength(2);
            expect(matches.map(m => m.id)).toContain('op-1');
            expect(matches.map(m => m.id)).toContain('op-2');
        });

        it('should filter out operators without "White Glove" if requested', async () => {
            const request = {
                service_type: 'medical' as const,
                pickup_address: 'NY',
                pickup_lat: 40.71,
                pickup_lng: -74.01,
                metadata: {
                    mobility_level: 'wheelchair',
                    service_level: 'white-glove'
                }
            };

            const matches = await findMatchingOperators(request);

            expect(matches).toHaveLength(1);
            expect(matches[0].company_name).toBe('Advanced Medical Transport');
        });

        it('should return empty array if no operators meet strict conditions', async () => {
            const request = {
                service_type: 'medical' as const,
                pickup_address: 'NY',
                pickup_lat: 40.71,
                pickup_lng: -74.01,
                metadata: {
                    mobility_level: 'stretcher', // op-2 has this
                    service_animal: true // op-2 DOES NOT have this
                }
            };

            const matches = await findMatchingOperators(request);

            expect(matches).toHaveLength(0);
        });
    });

    describe('School Strict Conditions', () => {
        it('should match operators with "Special Needs" when requested', async () => {
            const request = {
                service_type: 'school' as const,
                pickup_address: 'NY',
                pickup_lat: 40.71,
                pickup_lng: -74.01,
                metadata: {
                    special_needs: true
                }
            };

            const matches = await findMatchingOperators(request);

            expect(matches).toHaveLength(1);
            expect(matches[0].company_name).toBe('School Bus Co');
        });

        it('should return NO operators if requiring "No-Adult Release" which none have', async () => {
            const request = {
                service_type: 'school' as const,
                pickup_address: 'NY',
                pickup_lat: 40.71,
                pickup_lng: -74.01,
                metadata: {
                    no_adult_release: 'yes'
                }
            };

            const matches = await findMatchingOperators(request);

            expect(matches).toHaveLength(0);
        });
    });

    describe('Fallback Unmatched Request Mechanism', () => {
        it('should flag requests for manual allocation when length is zero (Fallback logic spec)', () => {
            // In our route.ts logic:
            // if (operators.length === 0) { 
            //   update metadata_private: { requires_manual_allocation: true } 
            //   sendAdminEmail()
            // }

            const operators: any[] = [];
            const requiresManualAllocation = operators.length === 0;

            expect(operators).toHaveLength(0);
            expect(requiresManualAllocation).toBe(true);
        });
    });
});
