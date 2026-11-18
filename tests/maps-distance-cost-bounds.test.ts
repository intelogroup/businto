/**
 * PERMANENT REGRESSION — BUS-MAPS-DISTANCE-COST-001 (converted from the loop probe of cycle 2026-11-18-0652; assertions unchanged)
 * POST /api/maps/distance cost/bound (cousin of BUS-GEOCODE-COST-001 and
 * BUS-CHAT-LLM-COST-001, sibling route of BUS-MAPS-DISTANCE-ADDRESS-SHAPE-001).
 * The route is unauthenticated and fans out to upstream services
 * (geocodeToCoords x2 + calculateRoute per call) with NO rate limit and
 * NO bound on the address strings it forwards.
 * Invariant: an unauthenticated upstream-fanout route bounds volume and
 * input size — oversized addresses are refused 400 (never forwarded
 * verbatim) and a rapid flood is throttled before every call reaches
 * the upstream mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/routing', () => ({ calculateRoute: vi.fn(), geocodeToCoords: vi.fn() }));
import { POST } from '@/app/api/maps/distance/route';
import { calculateRoute, geocodeToCoords } from '@/lib/routing';
const req = (body: any) => new NextRequest('http://localhost/api/maps/distance', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
describe('maps/distance cost and input bound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(calculateRoute).mockResolvedValue({ distance_miles: 1.2, duration_mins: 5 } as any);
    vi.mocked(geocodeToCoords).mockResolvedValue({ lat: 42.36, lng: -71.06 });
  });
  it('control: one string-address call geocodes and routes exactly', async () => {
    const r = await POST(req({ origin: 'Everett, MA', destination: 'Boston, MA' }));
    expect(r.status).toBe(200);
    expect(geocodeToCoords).toHaveBeenCalledWith('Everett, MA');
    expect(geocodeToCoords).toHaveBeenCalledWith('Boston, MA');
    expect(calculateRoute).toHaveBeenCalledTimes(1);
  });
  it('attack: oversized address refused 400, never forwarded verbatim', async () => {
    const huge = 'A'.repeat(100000);
    const r = await POST(req({ origin: huge, destination: 'Boston, MA' }));
    expect(r.status).toBe(400);
    expect(geocodeToCoords).not.toHaveBeenCalledWith(huge);
  });
  it('attack: rapid flood is throttled before every call reaches upstream', async () => {
    let throttled = 0;
    for (let i = 0; i < 25; i++) {
      const r = await POST(req({ origin: 'Everett, MA', destination: 'Boston, MA' }));
      if (r.status === 429) throttled++;
    }
    expect(throttled).toBeGreaterThan(0);
    expect(vi.mocked(geocodeToCoords).mock.calls.length).toBeLessThan(50);
  });
});
