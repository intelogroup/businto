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
        'id, status, service_type, pickup_address, dropoff_address, pickup_fuzzy, dropoff_fuzzy, ' +
        'start_date, start_time, end_date, end_time, is_recurring, recurrence_pattern, ' +
        'metadata_safe, user_id'
      )
      .eq('id', id)
      .single();

    if (tripError || !trip || typeof trip === 'string') {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    // Cast to expected shape after error guard
    const tripData = trip as {
      id: string; status: string; service_type: string; pickup_address: string; dropoff_address: string;
      pickup_fuzzy: string; dropoff_fuzzy: string; start_date: string; start_time: string;
      end_date: string; end_time: string; is_recurring: boolean; recurrence_pattern: string;
      metadata_safe: Record<string, unknown>; user_id: string;
    };

    // M9: Only completed or cancelled trips can be re-requested.
    // Prevents users from duplicating active/pending requests.
    const RE_REQUESTABLE_STATUSES = ['completed', 'cancelled'];
    if (!RE_REQUESTABLE_STATUSES.includes(tripData.status)) {
      return NextResponse.json(
        { error: 'Only completed or cancelled trips can be re-requested' },
        { status: 400 }
      );
    }

    // Ownership check: only the trip owner may re-request
    if (tripData.user_id !== user.id) {
      await logEvent({
        event_type: 're_request.unauthorized',
        status: 'error',
        actor_id: user.id,
        request_id: id,
        message: 'User attempted to re-request a trip they do not own',
        metadata: { owner_id: tripData.user_id, requester_id: user.id },
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
        id: tripData.id,
        service_type: tripData.service_type,
        pickup_address: tripData.pickup_address,
        dropoff_address: tripData.dropoff_address,
        pickup_fuzzy: tripData.pickup_fuzzy,
        dropoff_fuzzy: tripData.dropoff_fuzzy,
        start_date: tripData.start_date,
        start_time: tripData.start_time,
        end_date: tripData.end_date,
        end_time: tripData.end_time,
        is_recurring: tripData.is_recurring,
        recurrence_pattern: tripData.recurrence_pattern,
        metadata_safe: tripData.metadata_safe ?? {},
      },
    });
  } catch (error) {
    console.error('[Re-request API] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
