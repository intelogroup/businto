import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/messages/threads/route';
import { NextRequest } from 'next/server';

// Mock supabaseAdmin and helpers
vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

describe('Message Threads API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when user is not authenticated', async () => {
    const { requireUser } = await import('@/lib/supabase-server');
    (requireUser as any).mockResolvedValue(null);

    const req = new NextRequest('http://localhost:3000/api/messages/threads');
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return empty threads when user has no messages', async () => {
    const { requireUser } = await import('@/lib/supabase-server');
    const { supabaseAdmin } = await import('@/lib/supabase-server');
    (requireUser as any).mockResolvedValue({ id: 'user-1' });

    const chain: any = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.or = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockResolvedValue({ data: [], error: null });
    (supabaseAdmin.from as any).mockReturnValue(chain);

    const req = new NextRequest('http://localhost:3000/api/messages/threads');
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.threads).toEqual([]);
  });

  it('should group messages into threads by request_id', async () => {
    const { requireUser } = await import('@/lib/supabase-server');
    const { supabaseAdmin } = await import('@/lib/supabase-server');
    (requireUser as any).mockResolvedValue({ id: 'user-1' });

    const mockMessages = [
      {
        id: 'msg-1',
        request_id: 'req-1',
        booking_id: null,
        sender_id: 'operator-1',
        recipient_id: 'user-1',
        content: 'Latest message',
        is_read: false,
        created_at: '2026-03-22T12:00:00Z',
      },
      {
        id: 'msg-2',
        request_id: 'req-1',
        booking_id: null,
        sender_id: 'user-1',
        recipient_id: 'operator-1',
        content: 'Earlier message',
        is_read: true,
        created_at: '2026-03-22T11:00:00Z',
      },
    ];

    const mockProfiles = [
      { id: 'operator-1', full_name: 'Test Operator', avatar_url: null, role: 'operator' },
    ];

    let callCount = 0;
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'messages') {
        return {
          select: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockMessages, error: null }),
        };
      }
      if (table === 'unified_profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: mockProfiles, error: null }),
        };
      }
      return {};
    });

    const req = new NextRequest('http://localhost:3000/api/messages/threads');
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.threads).toHaveLength(1);
    expect(data.threads[0].requestId).toBe('req-1');
    expect(data.threads[0].otherUser.full_name).toBe('Test Operator');
    expect(data.threads[0].lastMessage.content).toBe('Latest message');
    expect(data.threads[0].unreadCount).toBe(1);
    expect(data.threads[0].messageCount).toBe(2);
  });

  it('should separate threads by different request_ids', async () => {
    const { requireUser } = await import('@/lib/supabase-server');
    const { supabaseAdmin } = await import('@/lib/supabase-server');
    (requireUser as any).mockResolvedValue({ id: 'user-1' });

    const mockMessages = [
      {
        id: 'msg-1',
        request_id: 'req-1',
        booking_id: null,
        sender_id: 'operator-1',
        recipient_id: 'user-1',
        content: 'Thread 1',
        is_read: true,
        created_at: '2026-03-22T12:00:00Z',
      },
      {
        id: 'msg-2',
        request_id: 'req-2',
        booking_id: null,
        sender_id: 'operator-2',
        recipient_id: 'user-1',
        content: 'Thread 2',
        is_read: false,
        created_at: '2026-03-22T13:00:00Z',
      },
    ];

    const mockProfiles = [
      { id: 'operator-1', full_name: 'Operator A', avatar_url: null, role: 'operator' },
      { id: 'operator-2', full_name: 'Operator B', avatar_url: null, role: 'operator' },
    ];

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'messages') {
        return {
          select: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockMessages, error: null }),
        };
      }
      if (table === 'unified_profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: mockProfiles, error: null }),
        };
      }
      return {};
    });

    const req = new NextRequest('http://localhost:3000/api/messages/threads');
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.threads).toHaveLength(2);
    // Most recent first
    expect(data.threads[0].requestId).toBe('req-2');
    expect(data.threads[1].requestId).toBe('req-1');
  });

  it('should only expose safe profile fields (no phone/email)', async () => {
    const { requireUser } = await import('@/lib/supabase-server');
    const { supabaseAdmin } = await import('@/lib/supabase-server');
    (requireUser as any).mockResolvedValue({ id: 'user-1' });

    const mockMessages = [
      {
        id: 'msg-1',
        request_id: 'req-1',
        booking_id: null,
        sender_id: 'operator-1',
        recipient_id: 'user-1',
        content: 'Hello',
        is_read: true,
        created_at: '2026-03-22T12:00:00Z',
      },
    ];

    const selectSpy = vi.fn().mockReturnThis();

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'messages') {
        return {
          select: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockMessages, error: null }),
        };
      }
      if (table === 'unified_profiles') {
        return {
          select: selectSpy,
          in: vi.fn().mockResolvedValue({
            data: [{ id: 'operator-1', full_name: 'Op', avatar_url: null, role: 'operator' }],
            error: null,
          }),
        };
      }
      return {};
    });

    const req = new NextRequest('http://localhost:3000/api/messages/threads');
    await GET(req);

    // Verify the select call does NOT include phone or email
    expect(selectSpy).toHaveBeenCalledWith('id, full_name, avatar_url, role');
  });
});
