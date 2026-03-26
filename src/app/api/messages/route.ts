import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase, requireUser } from '@/lib/supabase-server';
import { sendSMS, smsTemplates } from '@/lib/sms';

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
    } else if (request_id) {
      // For request-based messages, verify the sender owns the request
      // or has a quote on it (is an operator participant)
      const { data: req } = await supabase
        .from('transport_requests')
        .select('user_id')
        .eq('id', request_id)
        .single();
      if (!req) {
        return NextResponse.json({ error: 'Request not found' }, { status: 404 });
      }
      const isRequestOwner = req.user_id === user.id;
      if (!isRequestOwner) {
        // Check if sender is an operator with a quote on this request
        const { data: quote } = await supabase
          .from('quotes')
          .select('operator_id')
          .eq('request_id', request_id)
          .eq('operator_id', user.id)
          .maybeSingle();
        if (!quote) {
          return NextResponse.json(
            { error: 'You are not a participant in this request' },
            { status: 403 }
          );
        }
      }
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        request_id,
        booking_id,
        sender_id,
        recipient_id,
        content
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
        message: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
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

    if (!message_ids?.length) {
      return NextResponse.json({ error: 'Missing message_ids' }, { status: 400 });
    }

    // SECURITY: Ensure user is the recipient of these messages
    const { error } = await supabase
      .from('messages')
      .update({ is_read: is_read ?? true })
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
