import { describe, it, expect } from 'vitest';
import { smsTemplates } from '@/lib/sms';

// ---------------------------------------------------------------------------
// Unit tests: smsTemplates.quoteAccepted and smsTemplates.newMessage
// These test the real template functions with no mocks.
// ---------------------------------------------------------------------------

describe('smsTemplates.quoteAccepted', () => {
  it('includes the operator name in the SMS body', () => {
    const result = smsTemplates.quoteAccepted({
      operatorName: 'Reliable Rides',
      requestId: 'req-abc-123',
      appUrl: 'https://businto.com',
    });
    expect(result.content).toContain('Reliable Rides');
    expect(result.tag).toBe('user_quote_accepted');
  });

  it('includes a deep link to the trip detail page', () => {
    const result = smsTemplates.quoteAccepted({
      operatorName: 'City Transport',
      requestId: 'req-xyz-999',
      appUrl: 'https://businto.com',
    });
    expect(result.content).toContain('https://businto.com/trips/req-xyz-999');
  });

  it('produces non-empty content and tag fields', () => {
    const result = smsTemplates.quoteAccepted({
      operatorName: 'Metro Bus',
      requestId: 'req-001',
      appUrl: 'https://businto.com',
    });
    expect(result.content.length).toBeGreaterThan(10);
    expect(result.tag).toBeTruthy();
  });
});

describe('smsTemplates.newMessage', () => {
  it('includes the sender name in the SMS body', () => {
    const result = smsTemplates.newMessage({
      senderName: 'Alice Driver',
      requestId: 'req-msg-456',
      appUrl: 'https://businto.com',
    });
    expect(result.content).toContain('Alice Driver');
    expect(result.tag).toBe('new_message_alert');
  });

  it('includes a truncated request ID in the SMS body', () => {
    const requestId = 'req-msg-456-full-uuid';
    const result = smsTemplates.newMessage({
      senderName: 'Bob Operator',
      requestId,
      appUrl: 'https://businto.com',
    });
    // Template uses requestId.slice(0, 8)
    expect(result.content).toContain(requestId.slice(0, 8));
  });

  it('includes a deep link to the trip page', () => {
    const result = smsTemplates.newMessage({
      senderName: 'Carol',
      requestId: 'req-deep-link',
      appUrl: 'https://businto.com',
    });
    expect(result.content).toContain('https://businto.com/trips/req-deep-link');
  });

  it('produces non-empty content and tag fields', () => {
    const result = smsTemplates.newMessage({
      senderName: 'Dave',
      requestId: 'req-002',
      appUrl: 'https://businto.com',
    });
    expect(result.content.length).toBeGreaterThan(10);
    expect(result.tag).toBeTruthy();
  });
});
