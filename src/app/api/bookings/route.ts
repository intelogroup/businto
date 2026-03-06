import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase, requireUser } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
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
        operator:operators!bookings_operator_id_fkey (
          id,
          company_name,
          company_email,
          company_phone,
          profile:operator_profiles!profile_id (
            id,
            full_name,
            avatar_url
          )
        )
      `)
      .order('created_at', { ascending: false });

    // SECURITY: Always scope to the authenticated user — never trust client-supplied user_id
    query = query.eq('user_id', user.id);

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
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingId, status, special_instructions } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 });
    }

    // SECURITY: Whitelist the only status a user may set — they can cancel but
    // cannot self-promote to completed/refunded/confirmed.
    const ALLOWED_USER_STATUSES = ['cancelled'];
    if (status !== undefined && !ALLOWED_USER_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Allowed values: ${ALLOWED_USER_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (special_instructions !== undefined) updateData.special_instructions = special_instructions;

    // SECURITY: Scope update to the authenticated user's own bookings
    const { data, error } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', bookingId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Booking not found or access denied' }, { status: 404 });
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
