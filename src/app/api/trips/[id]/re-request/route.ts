import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { logEvent } from '@/lib/event-logger';

/**
 * GET /api/trips/[id]/re-request
 *
 * Returns the subset of trip fields needed to pre-fill a new request form.
 * Auth-gated: the caller must be the trip owner.
 * Never returns metadata_private or exact full addresses.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // ── Auth: session required ────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    // ─────────────────────────────────────────────────────────────────────

    // Fetch only safe fields — never expose metadata_private or full addresses
    const { data: trip, error: tripError } = await supabaseAdmin
      .from('transport_requests')
      .select(
        'id, service_type, pickup_address, dropoff_address, pickup_fuzzy, dropoff_fuzzy, ' +
        'start_date, start_time, end_date, end_time, is_recurring, recurrence_pattern, ' +
        'metadata_safe, user_id'
      )
      .eq('id', id)
      .single();

    if (tripError || !trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    // Ownership check: only the trip owner may re-request
    if (trip.user_id !== user.id) {
      await logEvent({
        event_type: 're_request.unauthorized',
        status: 'error',
        actor_id: user.id,
        request_id: id,
        message: 'User attempted to re-request a trip they do not own',
        metadata: { owner_id: trip.user_id, requester_id: user.id },
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await logEvent({
      event_type: 're_request.fetched',
      status: 'success',
      actor_type: 'user',
      actor_id: user.id,
      request_id: id,
      message: 'Re-request data fetched',
    });

    // Return only the fields the form needs to pre-fill
    return NextResponse.json({
      trip: {
        id: trip.id,
        service_type: trip.service_type,
        pickup_address: trip.pickup_address,
        dropoff_address: trip.dropoff_address,
        pickup_fuzzy: trip.pickup_fuzzy,
        dropoff_fuzzy: trip.dropoff_fuzzy,
        start_date: trip.start_date,
        start_time: trip.start_time,
        end_date: trip.end_date,
        end_time: trip.end_time,
        is_recurring: trip.is_recurring,
        recurrence_pattern: trip.recurrence_pattern,
        metadata_safe: trip.metadata_safe ?? {},
      },
    });
  } catch (error) {
    console.error('[Re-request API] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
