/**
 * PERMANENT REGRESSION — BUS-GEOCODE-COST-001 (converted from the loop probe of cycle 2026-11-16-1252; assertions unchanged)
 * GET /api/geocode hostile limit / query shapes.
 * Unauthenticated proxy to Photon: route forwards `limit` verbatim and
 * `q` unbounded, with no rate limit.
 * Invariant: limit forwarded upstream is an integer in a sane range
 * (1..50) or hostile limit refused 400; q forwarded is bounded in length
 * (<=500 chars) or refused 400; rapid unauthenticated calls are throttled
 * (429) before reaching upstream; control exact.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/geocode/route';
const calls: string[] = [];
function mockFetch() {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    calls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ features: [{ properties: { osm_id: 1, name: 'Boston', city: 'Boston', state: 'MA', country: 'USA' }, geometry: { coordinates: [-71.0589, 42.3601] } }] }) };
  }));
}
const req = (qs = '') => new NextRequest(`http://localhost/api/geocode${qs}`);
const upstreamLimit = (u: string) => new URL(u).searchParams.get('limit');
const upstreamQ = (u: string) => new URL(u).searchParams.get('q') || '';
describe('geocode hostile limit/q shapes', () => {
  beforeEach(() => mockFetch());
  afterEach(() => vi.unstubAllGlobals());
  it('control: normal query normalized, default limit 5', async () => {
    const r = await GET(req('?q=Boston')); expect(r.status).toBe(200);
    const b = await r.json(); expect(b).toHaveLength(1); expect(b[0].display_name).toContain('Boston');
    expect(calls).toHaveLength(1); expect(upstreamLimit(calls[0])).toBe('5');
  });
  it('control: short query returns [] with no upstream call', async () => {
    const r = await GET(req('?q=ab')); expect(r.status).toBe(200); expect(await r.json()).toEqual([]); expect(calls).toHaveLength(0);
  });
  it('attack: hostile limit refused 400 or clamped to 1..50 upstream', async () => {
    for (const lim of ['100000', '-1', '0', 'abc', '1e9', '999999999999']) {
      calls.length = 0;
      const r = await GET(req(`?q=Boston&limit=${encodeURIComponent(lim)}`));
      if (r.status === 400) continue;
      expect(r.status, lim).toBe(200);
      const up = Number(upstreamLimit(calls[0]));
      expect(Number.isInteger(up) && up >= 1 && up <= 50, `limit=${lim} forwarded as ${upstreamLimit(calls[0])}`).toBe(true);
    }
  });
  it('attack: oversized q refused 400 or truncated to <=500 chars upstream', async () => {
    const big = 'a'.repeat(100000);
    const r = await GET(req(`?q=${big}`));
    if (r.status === 400) return;
    expect(r.status).toBe(200);
    expect(upstreamQ(calls[0]).length).toBeLessThanOrEqual(500);
  });
  it('attack: 25 rapid unauthenticated calls throttled before upstream', async () => {
    let throttled = 0;
    for (let i = 0; i < 25; i++) { const r = await GET(req('?q=Boston')); if (r.status === 429) throttled++; }
    expect(throttled).toBeGreaterThan(0);
    expect(calls.length).toBeLessThan(25);
  });
});
