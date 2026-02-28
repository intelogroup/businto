import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const operatorId = searchParams.get('operator_id');
    const status = searchParams.get('status');

    let query = supabase
      .from('bookings')
      .select(`
        *,
        request:transport_requests (*),
        quote:quotes (*),
        user:profiles!bookings_user_id_fkey (
          id,
          full_name,
          email,
          phone,
          avatar_url
        ),
        operator:profiles!bookings_operator_id_fkey (
          id,
          full_name,
          company_name,
          email,
          phone,
          avatar_url
        )
      `)
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }
    if (operatorId) {
      query = query.eq('operator_id', operatorId);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bookings: data });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { bookingId, status, special_instructions } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 });
    }

    const updateData: any = {};
    if (status) updateData.status = status;
    if (special_instructions !== undefined) updateData.special_instructions = special_instructions;

    const { data, error } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', bookingId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      booking: data
    });
  } catch (error) {
    console.error('Error updating booking:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
