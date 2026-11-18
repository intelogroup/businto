/**
 * PERMANENT REGRESSION — BUS-MAPS-DISTANCE-ADDRESS-SHAPE-001 (converted from the loop probe of cycle 2026-11-18-0052; assertions unchanged)
 * POST /api/maps/distance hostile ADDRESS shapes (cousin of
 * BUS-MAPS-DISTANCE-COORD-SHAPE-001: the fix parsed coordinates but the
 * address legs still flow unchecked into geocodeToCoords).
 * Invariant: origin/destination must be strings before geocoding; a
 * non-string address shape is refused 400, never forwarded to the
 * geocoder, never a 500.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/routing', () => ({ calculateRoute: vi.fn(), geocodeToCoords: vi.fn() }));
import { POST } from '@/app/api/maps/distance/route';
import { calculateRoute, geocodeToCoords } from '@/lib/routing';
const req = (body: any) => new NextRequest('http://localhost/api/maps/distance', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
describe('maps/distance hostile address shapes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(calculateRoute).mockResolvedValue({ distance_miles: 1.2, duration_mins: 5 } as any);
    vi.mocked(geocodeToCoords).mockResolvedValue({ lat: 42.36, lng: -71.06 });
  });
  it('control: string addresses geocode and route exactly', async () => {
    const r = await POST(req({ origin: 'Everett, MA', destination: 'Boston, MA' }));
    expect(r.status).toBe(200);
    expect(geocodeToCoords).toHaveBeenCalledWith('Everett, MA');
    expect(geocodeToCoords).toHaveBeenCalledWith('Boston, MA');
  });
  it('attack: non-string origin shapes refused 400, never geocoded, never 500', async () => {
    for (const bad of [12345, true, ['Everett, MA'], { q: 'Everett, MA' }, 1.5]) {
      vi.clearAllMocks();
      vi.mocked(calculateRoute).mockResolvedValue({ distance_miles: 1.2, duration_mins: 5 } as any);
      vi.mocked(geocodeToCoords).mockResolvedValue({ lat: 42.36, lng: -71.06 });
      const r = await POST(req({ origin: bad, destination: 'Boston, MA' }));
      expect(r.status, JSON.stringify(bad)).toBe(400);
      expect(geocodeToCoords).not.toHaveBeenCalledWith(bad);
      expect(calculateRoute).not.toHaveBeenCalled();
    }
  });
  it('attack: non-string destination shapes refused 400, never geocoded, never 500', async () => {
    for (const bad of [12345, true, ['Boston, MA'], { q: 'Boston, MA' }]) {
      vi.clearAllMocks();
      vi.mocked(calculateRoute).mockResolvedValue({ distance_miles: 1.2, duration_mins: 5 } as any);
      vi.mocked(geocodeToCoords).mockResolvedValue({ lat: 42.36, lng: -71.06 });
      const r = await POST(req({ origin: 'Everett, MA', destination: bad }));
      expect(r.status, JSON.stringify(bad)).toBe(400);
      expect(geocodeToCoords).not.toHaveBeenCalledWith(bad);
      expect(calculateRoute).not.toHaveBeenCalled();
    }
  });
  it('attack: hostile address alongside valid coords never reaches the geocoder', async () => {
    const r = await POST(req({ origin: { q: 'x' }, originLat: 42.36, originLng: -71.06, destLat: 42.37, destLng: -71.07 }));
    expect(r.status).toBe(200);
    expect(geocodeToCoords).not.toHaveBeenCalled();
    expect(calculateRoute).toHaveBeenCalledWith(42.36, -71.06, 42.37, -71.07);
  });
});
