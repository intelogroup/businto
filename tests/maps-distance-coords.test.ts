/**
 * PERMANENT REGRESSION — BUS-MAPS-DISTANCE-COORD-SHAPE-001 (converted from the loop probe of cycle 2026-11-16-0352; assertions unchanged)
 * POST /api/maps/distance hostile coordinate shapes.
 * Invariant: coordinates forwarded to the routing engine must be finite
 * numbers in range (lat -90..90, lng -180..180); non-numeric, non-finite,
 * structured, or out-of-range shapes are refused 400 and never forwarded;
 * a legitimate 0 coordinate (equator / prime meridian) is accepted as a
 * coordinate, not treated as missing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/routing', () => ({ calculateRoute: vi.fn(), geocodeToCoords: vi.fn() }));
import { POST } from '@/app/api/maps/distance/route';
import { calculateRoute, geocodeToCoords } from '@/lib/routing';
const req = (body: any) => new NextRequest('http://localhost/api/maps/distance', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const VALID = { originLat: 42.36, originLng: -71.06, destLat: 42.37, destLng: -71.07 };
describe('maps/distance hostile coordinates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(calculateRoute).mockResolvedValue({ distance_miles: 1.2, duration_mins: 5 });
    vi.mocked(geocodeToCoords).mockResolvedValue(null);
  });
  it('control: valid numeric coords route exactly', async () => {
    const r = await POST(req(VALID)); expect(r.status).toBe(200);
    expect(calculateRoute).toHaveBeenCalledWith(42.36, -71.06, 42.37, -71.07);
  });
  it('control: zero coordinates are accepted as coordinates', async () => {
    const r = await POST(req({ originLat: 0, originLng: 0, destLat: 0, destLng: 0 }));
    expect(r.status).toBe(200);
    expect(calculateRoute).toHaveBeenCalledWith(0, 0, 0, 0);
    expect(geocodeToCoords).not.toHaveBeenCalled();
  });
  it('attack: non-numeric string coords refused 400, never forwarded', async () => {
    for (const bad of ['abc', '42.36;DROP', 'NaN', 'Infinity', '']) {
      vi.clearAllMocks(); vi.mocked(calculateRoute).mockResolvedValue({ distance_miles: 1.2, duration_mins: 5 }); vi.mocked(geocodeToCoords).mockResolvedValue(null);
      const r = await POST(req({ ...VALID, originLat: bad }));
      expect(r.status, bad).toBe(400); expect(calculateRoute).not.toHaveBeenCalled();
    }
  });
  it('attack: structured coords (array/object/bool/null) refused 400, never forwarded, never 500', async () => {
    for (const bad of [[42.36], { v: 42.36 }, true, null]) {
      vi.clearAllMocks(); vi.mocked(calculateRoute).mockResolvedValue({ distance_miles: 1.2, duration_mins: 5 }); vi.mocked(geocodeToCoords).mockResolvedValue(null);
      const r = await POST(req({ ...VALID, destLng: bad }));
      expect(r.status, JSON.stringify(bad)).toBe(400); expect(calculateRoute).not.toHaveBeenCalled();
    }
  });
  it('attack: out-of-range coords refused 400, never forwarded', async () => {
    for (const patch of [{ originLat: 91 }, { originLat: -91 }, { originLng: 181 }, { destLat: 999 }, { destLng: -999 }]) {
      vi.clearAllMocks(); vi.mocked(calculateRoute).mockResolvedValue({ distance_miles: 1.2, duration_mins: 5 }); vi.mocked(geocodeToCoords).mockResolvedValue(null);
      const r = await POST(req({ ...VALID, ...patch }));
      expect(r.status, JSON.stringify(patch)).toBe(400); expect(calculateRoute).not.toHaveBeenCalled();
    }
  });
  it('attack: numeric-string coords are not silently forwarded as strings', async () => {
    const r = await POST(req({ originLat: '42.36', originLng: '-71.06', destLat: '42.37', destLng: '-71.07' }));
    // Either a clean 400, or a 200 where every forwarded arg is a real number.
    if (r.status === 200) {
      const args = vi.mocked(calculateRoute).mock.calls[0];
      for (const a of args) expect(typeof a).toBe('number');
    } else { expect(r.status).toBe(400); expect(calculateRoute).not.toHaveBeenCalled(); }
  });
});
