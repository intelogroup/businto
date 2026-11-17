/**
 * PERMANENT REGRESSION — BUS-RATE-LIMIT-XFF-SPOOF-001 (converted from the loop probe of cycle 2026-11-16-0652; assertions unchanged)
 * businto/rate-limit-client-ip-spoofable, Tier 1, 2026-11-16)
 * Invariant: a single network principal cannot exceed the per-IP throttles
 * (guest request creation 10/IP/hr in src/app/api/requests/route.ts:53,
 * claim redemption 20/IP/hr in src/app/claim/[code]/route.ts) by choosing
 * header values. The probe composes getClientIP + checkRateLimit exactly as
 * those routes do, modelling the common proxy shape where the platform
 * appends the real peer address as the LAST X-Forwarded-For entry and a
 * client-supplied chain passes through in front of it.
 */
import { describe, it, expect } from 'vitest';
import { getClientIP, checkRateLimit } from '@/lib/rate-limit';
const reqWithXFF = (xff: string) => new Request('http://localhost/', { headers: { 'x-forwarded-for': xff } });
const REAL_PEER = '203.0.113.9';
describe('rate-limit client IP spoofing', () => {
  it('control: a stable XFF identity is throttled at the 10/hr guest cap', () => {
    const results: boolean[] = [];
    for (let i = 0; i < 12; i++) {
      const ip = getClientIP(reqWithXFF(REAL_PEER));
      results.push(checkRateLimit(`probe0652a:request:ip:${ip}`, 10));
    }
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results[10]).toBe(false);
    expect(results[11]).toBe(false);
  });
  it('identity: getClientIP returns the platform-appended last entry, not a client-chosen first entry', () => {
    expect(getClientIP(reqWithXFF(`198.51.100.7, ${REAL_PEER}`))).toBe(REAL_PEER);
  });
  it('attack: rotating the first XFF entry cannot mint a fresh guest-request bucket per attempt', () => {
    const results: boolean[] = [];
    for (let i = 0; i < 15; i++) {
      const ip = getClientIP(reqWithXFF(`198.51.100.${i}, ${REAL_PEER}`));
      results.push(checkRateLimit(`probe0652b:request:ip:${ip}`, 10));
    }
    // One principal, one appended peer: the cap must fire by attempt 11.
    expect(results[10]).toBe(false);
    expect(results.filter(Boolean).length).toBe(10);
  });
  it('attack: rotating the first XFF entry cannot defeat the 20/hr claim cap', () => {
    const results: boolean[] = [];
    for (let i = 0; i < 25; i++) {
      const ip = getClientIP(reqWithXFF(`192.0.2.${i}, ${REAL_PEER}`));
      results.push(checkRateLimit(`probe0652c:claim:ip:${ip}`, 20));
    }
    expect(results[20]).toBe(false);
    expect(results.filter(Boolean).length).toBe(20);
  });
});
