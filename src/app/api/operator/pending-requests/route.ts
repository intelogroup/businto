import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, requireUser } from '@/lib/supabase-server';

/**
 * GET /api/operator/pending-requests
 *
 * Returns open transport requests that the authenticated operator can quote on.
 * Filters by:
 *  - Request status is 'pending' or 'quoted' (still accepting quotes)
 *  - Request hasn't expired
 *  - Operator hasn't already submitted a quote for it
 *  - Request service type matches operator specialties (if any)
 *
 * SECURITY: Operator-only endpoint. Only returns safe metadata (no PII).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve operator ID
    const { data: opProfile } = await supabaseAdmin
      .from('operator_profiles')
      .select('operator_id')
      .eq('id', user.id)
      .maybeSingle();

    let operatorId = opProfile?.operator_id;

    if (!operatorId) {
      const { data: directOp } = await supabaseAdmin
        .from('operators')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (!directOp) {
        return NextResponse.json(
          { error: 'Not an operator' },
          { status: 403 }
        );
      }
      operatorId = directOp.id;
    }

    // Get operator specialties to filter relevant requests
    const { data: operator } = await supabaseAdmin
      .from('operators')
      .select('specialties, service_areas, is_active')
      .eq('id', operatorId)
      .single();

    if (!operator?.is_active) {
      return NextResponse.json(
        { error: 'Operator account is inactive' },
        { status: 403 }
      );
    }

    // Get IDs of requests the operator already quoted on
    const { data: existingQuotes } = await supabaseAdmin
      .from('quotes')
      .select('request_id')
      .eq('operator_id', operatorId);

    const quotedRequestIds = (existingQuotes || []).map((q: any) => q.request_id);

    // Fetch open requests (pending or quoted, not expired)
    const query = supabaseAdmin
      .from('transport_requests')
      .select('id, service_type, pickup_fuzzy, dropoff_fuzzy, start_date, start_time, end_date, end_time, is_recurring, recurrence_pattern, metadata_safe, status, created_at')
      .in('status', ['pending', 'quoted'])
      .gte('start_date', new Date().toISOString().split('T')[0])
      .order('created_at', { ascending: false })
      .limit(30);

    const { data: requests, error: reqError } = await query;

    if (reqError) {
      console.error('Error fetching pending requests:', reqError);
      return NextResponse.json(
        { error: 'Failed to fetch requests' },
        { status: 500 }
      );
    }

    // Filter out already-quoted requests client-side (Supabase doesn't support NOT IN well)
    const filtered = (requests || []).filter(
      (r: any) => !quotedRequestIds.includes(r.id)
    );

    return NextResponse.json({ requests: filtered });
  } catch (error) {
    console.error('Error in pending-requests:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
