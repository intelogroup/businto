/**
 * Tests for POST /api/email/send
 * Authenticated-only email dispatch route (test-email page).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-server', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  emailTemplates: {
    requestConfirmation: vi.fn().mockReturnValue({ subject: 'Confirmed', html: '<p>ok</p>' }),
    quoteReceived: vi.fn().mockReturnValue({ subject: 'Quote', html: '<p>q</p>' }),
    operatorOrderDetails: vi.fn().mockReturnValue({ subject: 'Order', html: '<p>o</p>' }),
  },
}));

import { POST } from '../src/app/api/email/send/route';
import { requireUser } from '@/lib/supabase-server';

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/email/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/email/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(makeRequest({ type: 'request_confirmation', to: 'a@b.com', data: {} }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it('returns 400 when type is missing', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    const res = await POST(makeRequest({ to: 'a@b.com', data: {} }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when to/userEmail is missing', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    const res = await POST(makeRequest({ type: 'request_confirmation', data: {} }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when data is missing', async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    const res = await POST(makeRequest({ type: 'request_confirmation', to: 'a@b.com' }));
    expect(res.status).toBe(400);
  });

  it('accepts userEmail nested in data as recipient', async () => {
    const { sendEmail } = await import('@/lib/email');
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    const res = await POST(makeRequest({
      type: 'request_confirmation',
      data: { userEmail: 'nested@example.com', name: 'Test' },
    }));
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'nested@example.com' })
    );
  });
});
