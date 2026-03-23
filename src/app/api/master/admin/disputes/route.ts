import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, requireAdmin } from '@/lib/supabase-server';

const VALID_DISPUTE_STATUSES = ['open', 'under_review', 'resolved', 'dismissed'] as const;
type DisputeStatus = typeof VALID_DISPUTE_STATUSES[number];

/**
 * GET /api/master/admin/disputes
 *
 * Returns disputes flagged on transport_requests.
 * Optionally filter by status.
 *
 * Query params:
 *   status  — open | under_review | resolved | dismissed
 *   page    — default 1
 *   limit   — default 20 (max 50)
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as DisputeStatus | null;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    if (status && !VALID_DISPUTE_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_DISPUTE_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    let query = supabaseAdmin
      .from('transport_requests')
      .select(
        `id, status, service_type, pickup_fuzzy, dropoff_fuzzy, start_date, created_at,
         dispute_status, dispute_note, dispute_flagged_at, dispute_resolved_at,
         user:profiles!transport_requests_user_id_fkey (id, full_name, email)`,
        { count: 'exact' }
      )
      .not('dispute_status', 'is', null)
      .order('dispute_flagged_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status) {
      query = query.eq('dispute_status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching disputes:', error);
      return NextResponse.json({ error: 'Failed to fetch disputes' }, { status: 500 });
    }

    return NextResponse.json({
      disputes: data || [],
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (error) {
    console.error('Disputes GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/master/admin/disputes
 *
 * Flag a trip for dispute review or update an existing dispute.
 *
 * Body:
 *   action       — "flag" | "update_status" | "resolve" | "dismiss"
 *   tripId       — UUID of the transport_request
 *   note         — (optional) admin note
 *   status       — required for "update_status"
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { action, tripId, note, status } = body;

    if (!action || !tripId) {
      return NextResponse.json(
        { error: 'Missing required fields: action, tripId' },
        { status: 400 }
      );
    }

    // Verify trip exists
    const { data: trip, error: tripError } = await supabaseAdmin
      .from('transport_requests')
      .select('id, dispute_status')
      .eq('id', tripId)
      .maybeSingle();

    if (tripError || !trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    let updatePayload: Record<string, unknown> = {};
    const now = new Date().toISOString();

    switch (action) {
      case 'flag':
        updatePayload = {
          dispute_status: 'open',
          dispute_note: note || null,
          dispute_flagged_at: now,
          dispute_resolved_at: null,
        };
        break;

      case 'update_status':
        if (!status || !VALID_DISPUTE_STATUSES.includes(status as DisputeStatus)) {
          return NextResponse.json(
            { error: `Invalid status. Must be one of: ${VALID_DISPUTE_STATUSES.join(', ')}` },
            { status: 400 }
          );
        }
        updatePayload = {
          dispute_status: status,
          ...(note !== undefined ? { dispute_note: note } : {}),
        };
        break;

      case 'resolve':
        updatePayload = {
          dispute_status: 'resolved',
          dispute_note: note || trip.dispute_status === 'resolved' ? undefined : null,
          dispute_resolved_at: now,
        };
        if (note !== undefined) updatePayload.dispute_note = note;
        break;

      case 'dismiss':
        updatePayload = {
          dispute_status: 'dismissed',
          dispute_resolved_at: now,
          ...(note !== undefined ? { dispute_note: note } : {}),
        };
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action. Must be one of: flag, update_status, resolve, dismiss' },
          { status: 400 }
        );
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('transport_requests')
      .update(updatePayload)
      .eq('id', tripId)
      .select('id, dispute_status, dispute_note, dispute_flagged_at, dispute_resolved_at')
      .single();

    if (updateError) {
      console.error('Dispute update error:', updateError);
      return NextResponse.json({ error: 'Failed to update dispute' }, { status: 500 });
    }

    return NextResponse.json({ success: true, dispute: updated });
  } catch (error) {
    console.error('Disputes POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
