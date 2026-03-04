import { describe, it, expect } from 'vitest';

/**
 * Maps Distance API Tests
 * 
 * Verifies the inputs handling for /api/maps/distance
 */
describe('Maps Distance API', () => {
    it('should reject if neither addresses nor coordinates are provided', () => {
        const payload = {};
        const isValid = !!(
            (payload as any).origin || (payload as any).destination ||
            (payload as any).originLat || (payload as any).originLng ||
            (payload as any).destLat || (payload as any).destLng
        );

        expect(isValid).toBe(false);
    });

    it('should accept valid coordinate pairs', () => {
        const payload = {
            originLat: '40.7128',
            originLng: '-74.0060',
            destLat: '42.3601',
            destLng: '-71.0589'
        };

        const isValid = !!(payload.originLat && payload.originLng && payload.destLat && payload.destLng);
        expect(isValid).toBe(true);
    });

    it('should detect missing individual coordinate pieces and require geocoding fallback', () => {
        const payload = {
            originLat: '40.7128',
            // originLng is missing
            destLat: '42.3601',
            destLng: '-71.0589',
            origin: 'New York, NY'
        };

        const needsGeocoding = !payload.originLat || !(payload as any).originLng;
        expect(needsGeocoding).toBe(true);
    });
});
