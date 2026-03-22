import { describe, it, expect } from 'vitest';
import {
  checkQuoteExpiry,
  isQuoteActionable,
  calculateQuoteExpiry,
  DEFAULT_QUOTE_EXPIRY_HOURS,
} from '@/lib/quote-expiry';

describe('checkQuoteExpiry', () => {
  it('should return not expired for null/undefined expires_at', () => {
    expect(checkQuoteExpiry(null).isExpired).toBe(false);
    expect(checkQuoteExpiry(undefined).isExpired).toBe(false);
    expect(checkQuoteExpiry(null).remainingSeconds).toBe(Infinity);
  });

  it('should return expired for a past timestamp', () => {
    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago
    const result = checkQuoteExpiry(pastDate);

    expect(result.isExpired).toBe(true);
    expect(result.statusCode).toBe(410);
    expect(result.error).toContain('expired');
    expect(result.remainingSeconds).toBeLessThan(0);
  });

  it('should return not expired for a future timestamp', () => {
    const futureDate = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour from now
    const result = checkQuoteExpiry(futureDate);

    expect(result.isExpired).toBe(false);
    expect(result.statusCode).toBe(200);
    expect(result.remainingSeconds).toBeGreaterThan(3500);
  });

  it('should handle Date objects as well as strings', () => {
    const futureDate = new Date(Date.now() + 60 * 1000);
    const result = checkQuoteExpiry(futureDate);

    expect(result.isExpired).toBe(false);
    expect(result.remainingSeconds).toBeGreaterThan(50);
  });

  it('should handle invalid date strings gracefully', () => {
    const result = checkQuoteExpiry('not-a-date');

    expect(result.isExpired).toBe(false);
    expect(result.remainingSeconds).toBe(Infinity);
  });

  it('should handle edge case: exactly now (treat as expired)', () => {
    // A quote expiring at exactly now should be treated as expired
    const now = new Date().toISOString();
    const result = checkQuoteExpiry(now);

    // Within 1 second margin, should be expired or just barely not
    expect(result.remainingSeconds).toBeLessThanOrEqual(0);
  });
});

describe('isQuoteActionable', () => {
  it('should return not actionable for accepted quotes', () => {
    const result = isQuoteActionable('accepted', null);
    expect(result.actionable).toBe(false);
    expect(result.reason).toContain('accepted');
  });

  it('should return not actionable for declined quotes', () => {
    const result = isQuoteActionable('declined', null);
    expect(result.actionable).toBe(false);
    expect(result.reason).toContain('declined');
  });

  it('should return not actionable for status "expired"', () => {
    const result = isQuoteActionable('expired', null);
    expect(result.actionable).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it('should return not actionable for pending quote with expired timestamp', () => {
    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
    const result = isQuoteActionable('pending', pastDate);

    expect(result.actionable).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it('should return actionable for pending quote with future expiry', () => {
    const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
    const result = isQuoteActionable('pending', futureDate);

    expect(result.actionable).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should return actionable for pending quote with no expiry', () => {
    const result = isQuoteActionable('pending', null);

    expect(result.actionable).toBe(true);
  });
});

describe('calculateQuoteExpiry', () => {
  it('should return a future ISO string', () => {
    const expiry = calculateQuoteExpiry();
    const expiryDate = new Date(expiry);

    expect(expiryDate.getTime()).toBeGreaterThan(Date.now());
  });

  it('should default to DEFAULT_QUOTE_EXPIRY_HOURS hours from now', () => {
    const expiry = calculateQuoteExpiry();
    const expiryDate = new Date(expiry);
    const expectedMs = DEFAULT_QUOTE_EXPIRY_HOURS * 3600 * 1000;
    const diffMs = expiryDate.getTime() - Date.now();

    // Allow 5 second tolerance for test execution time
    expect(diffMs).toBeGreaterThan(expectedMs - 5000);
    expect(diffMs).toBeLessThanOrEqual(expectedMs + 5000);
  });

  it('should respect custom hour parameter', () => {
    const expiry = calculateQuoteExpiry(2);
    const expiryDate = new Date(expiry);
    const diffHours = (expiryDate.getTime() - Date.now()) / (3600 * 1000);

    expect(diffHours).toBeGreaterThan(1.99);
    expect(diffHours).toBeLessThan(2.01);
  });

  it('should produce a valid ISO string', () => {
    const expiry = calculateQuoteExpiry(1);
    // ISO string parse should not produce NaN
    expect(isNaN(new Date(expiry).getTime())).toBe(false);
  });
});

describe('Server-side quote acceptance expiry guard (integration pattern)', () => {
  it('should demonstrate the guard pattern for /api/quotes/accept', () => {
    // This test documents the expected usage pattern in the accept route.
    // The accept route (which we cannot modify) should import checkQuoteExpiry
    // and use it like this:

    const mockQuote = {
      id: 'quote-1',
      status: 'pending',
      expires_at: new Date(Date.now() - 60 * 1000).toISOString(), // expired 1 min ago
    };

    const expiry = checkQuoteExpiry(mockQuote.expires_at);

    // The route should return 410 Gone
    expect(expiry.isExpired).toBe(true);
    expect(expiry.statusCode).toBe(410);
    expect(expiry.error).toBeTruthy();
  });

  it('should demonstrate the combined actionability check', () => {
    // Even if status is "pending", an expired timestamp should block acceptance
    const mockQuote = {
      id: 'quote-2',
      status: 'pending',
      expires_at: new Date(Date.now() - 1000).toISOString(),
    };

    const result = isQuoteActionable(mockQuote.status, mockQuote.expires_at);
    expect(result.actionable).toBe(false);
  });
});
