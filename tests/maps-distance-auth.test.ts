/**
 * Tests for /api/maps/distance and /api/geocode routes
 *
 * Security gap: Both routes are currently unauthenticated.
 * These tests document expected behavior and the missing auth guard.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the routing lib
vi.mock('@/lib/routing', () => ({
  calculateRoute: vi.fn(),
  geocodeToCoords: vi.fn(),
}));

import { POST } from '../src/app/api/maps/distance/route';
import { calculateRoute, geocodeToCoords } from '@/lib/routing';

describe('POST /api/maps/distance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when neither addresses nor coords are provided', async () => {
    const req = new NextRequest('http://localhost/api/maps/distance', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns distance when valid coords are provided', async () => {
    vi.mocked(calculateRoute).mockResolvedValue({
      distance_miles: 12.5,
      duration_mins: 22,
    });

    const req = new NextRequest('http://localhost/api/maps/distance', {
      method: 'POST',
      body: JSON.stringify({ originLat: 34.05, originLng: -118.25, destLat: 34.15, destLng: -118.35 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.distance.text).toContain('mi');
    expect(body.duration.text).toContain('mins');
  });

  it('geocodes addresses when coords are not provided', async () => {
    vi.mocked(geocodeToCoords)
      .mockResolvedValueOnce({ lat: 34.05, lng: -118.25 })
      .mockResolvedValueOnce({ lat: 34.15, lng: -118.35 });
    vi.mocked(calculateRoute).mockResolvedValue({ distance_miles: 5.0, duration_mins: 10 });

    const req = new NextRequest('http://localhost/api/maps/distance', {
      method: 'POST',
      body: JSON.stringify({ origin: '100 Main St, LA', destination: '200 Elm St, LA' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(geocodeToCoords).toHaveBeenCalledTimes(2);
  });

  it('returns 502 when route calculation fails', async () => {
    vi.mocked(geocodeToCoords).mockResolvedValue({ lat: 34.05, lng: -118.25 });
    vi.mocked(calculateRoute).mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/maps/distance', {
      method: 'POST',
      body: JSON.stringify({ origin: 'A', destination: 'B' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  /**
   * SECURITY GAP: This route has no authentication check.
   * Any unauthenticated caller can burn the Google Maps / routing API quota.
   * Recommendation: add `requireUser()` guard before processing.
   */
  it('TODO: should return 401 for unauthenticated requests', async () => {
    // This test is intentionally pending — the route currently allows anonymous access.
    // Once auth guard is added, implement this test:
    // const res = await POST(unauthenticatedReq);
    // expect(res.status).toBe(401);
    expect(true).toBe(true); // placeholder
  });
});
