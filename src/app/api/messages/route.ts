import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase, requireUser } from '@/lib/supabase/admin';
import { sendSMS, smsTemplates } from '@/lib/sms';
import { validateRequestParticipation } from '@/lib/policy';
import { parseTextField, parseBooleanField } from '@/lib/boundary';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { request_id, booking_id, sender_id, recipient_id, content } = await request.json();

    // SECURITY: Ensure the sender_id matches the authenticated user
    if (sender_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: Cannot send message as another user' }, { status: 403 });
    }

    if (!recipient_id || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: recipient_id, content' },
        { status: 400 }
      );
    }

    // BOUNDARY (BUS-MSG-CONTENT-SHAPE-001): content is a string before
    // it is stored — a truthy non-string used to be inserted verbatim
    // and then throw on content.substring() AFTER the row was written,
    // returning 500 for a message that exists (a retry duplicates it).
    const parsedContent = parseTextField(content, 'content');
    if (!parsedContent.ok) {
      return NextResponse.json({ error: parsedContent.error }, { status: 400 });
    }
    const contentText = parsedContent.value;

    if (!request_id && !booking_id) {
      return NextResponse.json(
        { error: 'Must provide either request_id or booking_id' },
        { status: 400 }
      );
    }

    // H6: Validate recipient is a participant in the request/booking.
    // Prevents users from messaging arbitrary user IDs.
    if (booking_id) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('user_id, operator_id')
        .eq('id', booking_id)
        .single();
      if (!booking || (booking.user_id !== recipient_id && booking.operator_id !== recipient_id)) {
        return NextResponse.json(
          { error: 'Recipient is not a participant in this booking' },
          { status: 403 }
        );
      }
      // Also verify sender is a participant
      if (booking.user_id !== user.id && booking.operator_id !== user.id) {
        return NextResponse.json(
          { error: 'You are not a participant in this booking' },
          { status: 403 }
        );
      }
    }
    // POLICY (M4, BUS-MSG-DUAL-CONTEXT-001): EVERY context leg the send
    // carries is validated — not booking OR request, but booking AND
    // request when both are supplied. A valid booking must not let a
    // foreign request_id ride unchecked into the insert (threads group
    // on request_id first, so the message would surface under the
    // foreign request). The request leg is the shared participation
    // decision in src/lib/policy.ts — the same sender/recipient rules
    // (and the same refusal statuses/messages) the request-only path
    // has always applied: the sender owns the request or has a quote
    // on it (H6: the recipient must participate too).
    if (request_id) {
      const refusal = await validateRequestParticipation(user.id, recipient_id, request_id);
      if (refusal) {
        return NextResponse.json({ error: refusal.error }, { status: refusal.status });
      }
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        request_id,
        booking_id,
        sender_id,
        recipient_id,
        content: contentText
      })
      .select('*')
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch sender info for the response — only expose safe display fields, never phone/email
    const { data: senderProfile } = await supabase
      .from('unified_profiles')
      .select('id, full_name, avatar_url, role')
      .eq('id', sender_id)
      .single();

    const responseData = {
      ...data,
      sender: senderProfile
    };

    // Create notification for recipient
    await supabase
      .from('notifications')
      .insert({
        user_id: recipient_id,
        type: 'message',
        title: 'New Message',
        message: contentText.substring(0, 100) + (contentText.length > 100 ? '...' : ''),
        data: { message_id: data.id, sender_id, request_id, booking_id }
      });

    // SMS Notification (Fire and forget)
    try {
      const recipientPhone = (await supabase.from('unified_profiles').select('phone').eq('id', recipient_id).single()).data?.phone;

      if (recipientPhone) {
        await sendSMS({
          to: recipientPhone,
          ...smsTemplates.newMessage({
            senderName: senderProfile?.full_name || 'Someone',
            requestId: request_id || booking_id || '',
            appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://businto.com'
          })
        });
      }
    } catch (smsErr) {
      console.error('Failed to send message notification SMS:', smsErr);
    }

    return NextResponse.json({
      success: true,
      message: responseData
    });
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('request_id');
    const bookingId = searchParams.get('booking_id');

    let query = supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (requestId) {
      query = query.eq('request_id', requestId);
    }
    if (bookingId) {
      query = query.eq('booking_id', bookingId);
    }

    // SECURITY: Always scope to the authenticated user — never trust client-supplied user_id
    query = query.or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`);

    const { data: messages, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich messages with profile data from unified_profiles view
    const userIds = [...new Set(messages.flatMap(m => [m.sender_id, m.recipient_id]))];
    
    if (userIds.length > 0) {
      // SECURITY: Only expose display fields — never phone, email, or private metadata
      const { data: profiles } = await supabase
        .from('unified_profiles')
        .select('id, full_name, avatar_url, role')
        .in('id', userIds);
      
      const profileMap = (profiles || []).reduce((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {} as Record<string, any>);

      const enrichedMessages = messages.map(m => ({
        ...m,
        sender: profileMap[m.sender_id],
        recipient: profileMap[m.recipient_id]
      }));

      return NextResponse.json({ messages: enrichedMessages });
    }

    return NextResponse.json({ messages: [] });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message_ids, is_read } = await request.json();

    // BOUNDARY (BUS-MSG-PATCH-SHAPE-001): message_ids must be an array
    // and is_read (when present) a boolean, parsed before any update —
    // a string or array-like object used to pass the `?.length` check
    // and reach .in() verbatim, and any is_read shape was written
    // verbatim. Absent/null is_read keeps the historical default true.
    if (!Array.isArray(message_ids) || message_ids.length === 0) {
      return NextResponse.json({ error: 'Missing message_ids' }, { status: 400 });
    }

    let isRead = true;
    if (is_read !== undefined && is_read !== null) {
      const parsedIsRead = parseBooleanField(is_read, 'is_read');
      if (!parsedIsRead.ok) {
        return NextResponse.json({ error: parsedIsRead.error }, { status: 400 });
      }
      isRead = parsedIsRead.value;
    }

    // SECURITY: Ensure user is the recipient of these messages
    const { error } = await supabase
      .from('messages')
      .update({ is_read: isRead })
      .in('id', message_ids)
      .eq('recipient_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating messages:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
