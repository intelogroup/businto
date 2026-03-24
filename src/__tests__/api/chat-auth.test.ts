import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

/**
 * B1 Security Fix — /api/chat Auth Guard
 *
 * Ensures that unauthenticated callers receive a 401 response
 * and are not served AI streaming output.
 */

// Mock the Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Mock the AI SDK to prevent real network calls
vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn(() => 'mock-model'),
  createOpenAI: vi.fn(() => vi.fn(() => 'mock-groq-model')),
}));

vi.mock('ai', () => ({
  streamText: vi.fn(),
  convertToModelMessages: vi.fn((msgs: unknown[]) => msgs),
}));

import { createClient } from '@/lib/supabase/server';
import { POST } from '@/app/api/chat/route';

const mockCreateClient = createClient as ReturnType<typeof vi.fn>;

function makeRequest(body: object = { messages: [{ role: 'user', content: 'Hello' }] }) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/chat — Auth Guard (B1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when user is not authenticated (user is null)', async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const req = makeRequest();
    const response = await POST(req);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ error: 'Unauthorized' });
  });

  it('should return 401 when getUser returns an error (no session)', async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'No session' },
        }),
      },
    });

    const req = makeRequest();
    const response = await POST(req);

    expect(response.status).toBe(401);
  });

  it('should not return 401 when user is authenticated (proceeds to AI layer)', async () => {
    const { streamText } = await import('ai');
    const mockStreamText = streamText as ReturnType<typeof vi.fn>;
    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => new NextResponse('stream', { status: 200 })),
    });

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-123', email: 'test@example.com' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    });

    const req = makeRequest();
    const response = await POST(req);

    // Should NOT be 401 — authenticated user passes the guard
    expect(response.status).not.toBe(401);
  });
});
