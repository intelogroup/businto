import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { request_id, booking_id, sender_id, recipient_id, content } = await request.json();

    if (!sender_id || !recipient_id || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: sender_id, recipient_id, content' },
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
      .select(`
        *,
        sender:profiles!messages_sender_id_fkey (
          id,
          full_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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

    return NextResponse.json({
      success: true,
      message: data
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
      .select(`
        *,
        sender:profiles!messages_sender_id_fkey (
          id,
          full_name,
          avatar_url
        ),
        recipient:profiles!messages_recipient_id_fkey (
          id,
          full_name,
          avatar_url
        )
      `)
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

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ messages: data });
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
    const { message_ids, is_read } = await request.json();

    if (!message_ids?.length) {
      return NextResponse.json({ error: 'Missing message_ids' }, { status: 400 });
    }

    const { error } = await supabase
      .from('messages')
      .update({ is_read: is_read ?? true })
      .in('id', message_ids);

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
