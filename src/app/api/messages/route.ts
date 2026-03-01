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

    // Fetch sender info from unified_profiles for the response
    const { data: senderProfile } = await supabase
      .from('unified_profiles')
      .select('*')
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
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('request_id');
    const bookingId = searchParams.get('booking_id');
    const userId = searchParams.get('user_id');

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
    if (userId) {
      query = query.or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich messages with profile data from unified_profiles view
    const userIds = [...new Set(messages.flatMap(m => [m.sender_id, m.recipient_id]))];
    
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('unified_profiles')
        .select('*')
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
