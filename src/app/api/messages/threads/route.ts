import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase, requireUser } from '@/lib/supabase-server';

/**
 * GET /api/messages/threads
 *
 * Returns a list of conversation threads for the authenticated user.
 * Each thread is grouped by (request_id OR booking_id) and includes:
 * - The other participant's profile info
 * - The last message preview
 * - Unread count
 */
export async function GET(_request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    return NextResponse.json({ threads });
  } catch (error) {
    console.error('Error fetching message threads:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
