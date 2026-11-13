import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase, requireUser } from '@/lib/supabase/admin';
import { parsePagination } from '@/lib/boundary';

/**
 * GET /api/messages/threads
 *
 * Returns a page of conversation threads for the authenticated user.
 * Each thread is grouped by (request_id OR booking_id) and includes:
 * - The other participant's profile info
 * - The last message preview
 * - Unread count
 *
 * Query params:
 *   page  — default 1
 *   limit — default 20 (max 50)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // BOUNDARY (BUS-THREADS-PAGINATION-001): the THREAD list is paged
    // with the shared parser like every sibling list (default 20, max
    // 50) — this route used to return every thread in one unbounded
    // response. Grouping still runs over the full message set (thread
    // counts, unread counts, and last-message previews must reflect
    // whole threads, never a truncated page of messages); only the
    // finished, sorted thread list is sliced.
    const pagination = parsePagination(new URL(request.url).searchParams, { maxLimit: 50 });
    if (!pagination.ok) {
      return NextResponse.json({ error: pagination.error }, { status: 400 });
    }

    // Fetch all messages where user is sender or recipient
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ threads: [] });
    }

    // Group messages into threads by request_id or booking_id
    const threadMap = new Map<string, {
      threadKey: string;
      requestId: string | null;
      bookingId: string | null;
      otherUserId: string;
      lastMessage: typeof messages[0];
      unreadCount: number;
      messageCount: number;
    }>();

    for (const msg of messages) {
      const threadKey = msg.request_id
        ? `request:${msg.request_id}`
        : `booking:${msg.booking_id}`;

      const otherUserId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;

      const existing = threadMap.get(threadKey);
      if (!existing) {
        threadMap.set(threadKey, {
          threadKey,
          requestId: msg.request_id,
          bookingId: msg.booking_id,
          otherUserId,
          lastMessage: msg,
          unreadCount: (msg.recipient_id === user.id && !msg.is_read) ? 1 : 0,
          messageCount: 1,
        });
      } else {
        existing.messageCount++;
        if (msg.recipient_id === user.id && !msg.is_read) {
          existing.unreadCount++;
        }
        // lastMessage is already the newest due to ORDER BY desc
      }
    }

    // Collect unique other-user IDs to fetch profiles
    const otherUserIds = [...new Set([...threadMap.values()].map(t => t.otherUserId))];

    // SECURITY: Only expose display-safe fields from unified_profiles
    const { data: profiles } = await supabase
      .from('unified_profiles')
      .select('id, full_name, avatar_url, role')
      .in('id', otherUserIds);

    const profileMap = (profiles || []).reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {} as Record<string, { id: string; full_name: string; avatar_url?: string; role: string }>);

    // Build response threads
    const threads = [...threadMap.values()].map(t => ({
      threadKey: t.threadKey,
      requestId: t.requestId,
      bookingId: t.bookingId,
      otherUser: profileMap[t.otherUserId] || { id: t.otherUserId, full_name: 'Unknown', role: 'user' },
      lastMessage: {
        id: t.lastMessage.id,
        content: t.lastMessage.content,
        createdAt: t.lastMessage.created_at,
        isFromMe: t.lastMessage.sender_id === user.id,
      },
      unreadCount: t.unreadCount,
      messageCount: t.messageCount,
    }));

    // Sort by most recent message first
    threads.sort((a, b) =>
      new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
    );

    // Slice the requested page of whole threads (see the BOUNDARY note
    // above — grouping/counts are computed over complete threads).
    return NextResponse.json({ threads: threads.slice(pagination.from, pagination.to + 1) });
  } catch (error) {
    console.error('Error fetching message threads:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
