/**
 * Tests for POST /api/logs
 * Public client-side error logging endpoint.
 * Identity is always derived from session, never from request body.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/event-logger', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { POST } from '../src/app/api/logs/route';
import { logEvent } from '@/lib/event-logger';
import { createClient } from '@/lib/supabase/server';

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/logs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: unauthenticated session
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });
  });

  it('returns 400 when event_type is missing', async () => {
    const res = await POST(makeRequest({ message: 'test' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing event_type/i);
  });

  it('logs event without user_id when unauthenticated', async () => {
    const res = await POST(makeRequest({ event_type: 'token_expired', message: 'link expired' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'client.token_expired',
        user_id: null,
      })
    );
  });

  it('logs event with session user_id when authenticated', async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-abc-123' } } }),
      },
    });
    const res = await POST(makeRequest({ event_type: 'page_error', message: 'crash' }));
    expect(res.status).toBe(200);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-abc-123' })
    );
  });

  it('ignores body-supplied user_id to prevent log poisoning', async () => {
    const res = await POST(makeRequest({
      event_type: 'spoofed',
      user_id: 'attacker-id',
      operator_id: 'fake-op',
    }));
    expect(res.status).toBe(200);
    // user_id in logEvent call should come from session (null here), not the body
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: null })
    );
    const callArg = (logEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.user_id).not.toBe('attacker-id');
  });

  it('uses error as default status when status omitted', async () => {
    await POST(makeRequest({ event_type: 'crash' }));
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' })
    );
  });

  it('returns 500 when logEvent throws', async () => {
    (logEvent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB down'));
    const res = await POST(makeRequest({ event_type: 'crash' }));
    expect(res.status).toBe(500);
  });
});
