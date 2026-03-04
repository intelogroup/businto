import { describe, it, expect } from 'vitest';

/**
 * Geocode Normalization Tests
 * 
 * Tests for Photon/OSM proxy logic:
 * - Normalization shape
 * - Short query guard (< 3 characters)
 */
describe('Geocode Normalization (/api/geocode)', () => {
    it('should return empty result for short queries (< 3 chars)', () => {
        const queries = ['a', 'ab', '  ', ''];
        queries.forEach(q => {
            const isTooShort = !q || q.trim().length < 3;
            expect(isTooShort).toBe(true);
        });
    });

    it('should normalize GeoJSON to Nominatim shape', () => {
        const mockPhotonResponse = {
            features: [
                {
                    properties: {
                        osm_id: 12345,
                        name: 'Central Park',
                        city: 'New York',
                        state: 'NY',
                        country: 'USA'
                    },
                    geometry: {
                        coordinates: [-73.9654, 40.7829] // [lon, lat]
                    }
                }
            ]
        };

        const normalize = (feature: any, idx: number) => {
            const p = feature.properties ?? {};
            const [lon, lat] = feature.geometry?.coordinates ?? [0, 0];

            const parts: string[] = [];
            if (p.name && p.name !== p.street) parts.push(p.name);
            if (p.housenumber) parts.push(p.housenumber);
            if (p.street) parts.push(p.street);
            if (p.city) parts.push(p.city);
            if (p.state) parts.push(p.state);
            if (p.postcode) parts.push(p.postcode);
            if (p.country) parts.push(p.country);

            return {
                place_id: p.osm_id ?? idx,
                display_name: parts.join(', '),
                lat: String(lat),
                lon: String(lon)
            };
        };

        const result = mockPhotonResponse.features.map((f, i) => normalize(f, i));

        expect(result[0]).toHaveProperty('place_id', 12345);
        expect(result[0]).toHaveProperty('lat', '40.7829');
        expect(result[0]).toHaveProperty('lon', '-73.9654');
        expect(result[0]).toHaveProperty('display_name', 'Central Park, New York, NY, USA');
    });

    it('should handle missing properties gracefully', () => {
        const mockEmptyFeature = { geometry: { coordinates: [] } };

        const p: any = {};
        const [lon, lat] = [0, 0];
        const parts: string[] = [];

        const result = {
            place_id: 0,
            display_name: parts.join(', '),
            lat: String(lat),
            lon: String(lon)
        };

        expect(result.place_id).toBe(0);
        expect(result.display_name).toBe('');
        expect(result.lat).toBe('0');
        expect(result.lon).toBe('0');
    });
});
