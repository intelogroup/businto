import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase, requireUser } from '@/lib/supabase/admin';
import { transition, isTerminalBookingStatus } from '@/lib/transitions';

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

    // STATE GUARD (BUS-BOOKING-TERMINAL-MUTATION-001): EVERY PATCH reads
    // the booking's current status first — not only status changes. A
    // terminal booking (completed/cancelled) is immutable to rider
    // PATCHes: field-only updates like special_instructions used to skip
    // the read entirely and rewrite finished trips.
    const { data: current } = await supabase
      .from('bookings')
      .select('status')
      .eq('id', bookingId)
      .eq('user_id', user.id)
      .single();

    if (!current) {
      return NextResponse.json({ error: 'Booking not found or access denied' }, { status: 404 });
    }

    if (isTerminalBookingStatus(current.status)) {
      return NextResponse.json(
        { error: `A ${current.status} booking can no longer be changed` },
        { status: 409 }
      );
    }

    // SECURITY (BUS-BOOKING-STATUS-001): setting 'cancelled' is a state
    // transition, not a field write — legal only from a live booking.
    // Bookings are created 'confirmed' and end 'completed' (cron) or
    // 'cancelled'; a terminal booking must refuse cancellation instead of
    // having its final state rewritten.
    const CANCELLABLE_BOOKING_STATUSES = ['confirmed'];
    if (status === 'cancelled' && !CANCELLABLE_BOOKING_STATUSES.includes(current.status)) {
      return NextResponse.json(
        { error: `A ${current.status} booking cannot be cancelled` },
        { status: 409 }
      );
    }

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (special_instructions !== undefined) updateData.special_instructions = special_instructions;

    if (status === 'cancelled') {
      // TRANSITION (BUS-BOOKING-CANCEL-COMPLETE-RACE-001): the read above
      // is not the guard — the write is. Claim the booking with a
      // predicated touch, re-read, and only then issue the cancel as a
      // transition predicated on 'confirmed'. A completion landing
      // anywhere inside the old read→write window now refuses the
      // cancel instead of being overwritten by it.
      const claim = await transition(supabase, {
        table: 'bookings',
        filters: [
          { column: 'id', value: bookingId },
          { column: 'user_id', value: user.id },
        ],
        guardField: 'status',
        from: CANCELLABLE_BOOKING_STATUSES,
        patch: { updated_at: new Date().toISOString() },
        mode: 'single',
      });

      if (!claim.ok) {
        return NextResponse.json(
          { error: 'This booking can no longer be cancelled' },
          { status: 409 }
        );
      }

      const { data: fresh } = await supabase
        .from('bookings')
        .select('status')
        .eq('id', bookingId)
        .eq('user_id', user.id)
        .single();

      if (!fresh || !CANCELLABLE_BOOKING_STATUSES.includes(fresh.status)) {
        return NextResponse.json(
          { error: `A ${fresh?.status || 'unknown'} booking cannot be cancelled` },
          { status: 409 }
        );
      }
    }

    // TRANSITION: the write itself is predicated on the status just
    // verified, and its outcome is checked — zero rows means the booking
    // changed state under us and nothing was written.
    const result = await transition(supabase, {
      table: 'bookings',
      filters: [
        { column: 'id', value: bookingId },
        { column: 'user_id', value: user.id },
      ],
      guardField: 'status',
      from: [current.status],
      patch: updateData,
      mode: 'single',
    });

    if (!result.ok) {
      if (result.kind === 'error') {
        return NextResponse.json(
          { error: (result.error as any)?.message || 'Failed to update booking' },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: 'Booking changed state and can no longer be updated this way' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      booking: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating booking:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
