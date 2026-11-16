import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase, requireAdmin } from '@/lib/supabase/admin';
import { parsePagination, parseEnumParam } from '@/lib/boundary';

// The transport-request status vocabulary (same as the rider requests
// route), plus this route's documented 'active' alias for
// pending-or-quoted.
const VALID_ADMIN_REQUEST_STATUSES = [
  'pending', 'quoted', 'booked', 'in_progress', 'completed', 'cancelled', 'active',
] as const;

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    // BOUNDARY (BUS-ADMIN-REQUESTS-STATUS-001): the status filter is a
    // member of the request vocabulary (or the 'active' alias) before
    // it reaches .eq()/.in() — parsed via parseEnumParam like the
    // sibling admin disputes and rider requests routes. Passed through
    // raw, an out-of-vocabulary status failed closed only by accident
    // (a silent empty 200), indistinguishable from a legitimately
    // empty result.
    const parsedStatus = parseEnumParam(
      searchParams.get('status'),
      'status',
      VALID_ADMIN_REQUEST_STATUSES
    );
    if (!parsedStatus.ok) {
      return NextResponse.json({ error: parsedStatus.error }, { status: 400 });
    }
    const status = parsedStatus.value;
    // BOUNDARY (BUS-ADMIN-REQUESTS-PAGINATION-001): shared pagination
    // parser — raw parseInt here had no NaN guard and no floor at all;
    // malformed/non-positive page/limit are refused 400 before any
    // data-layer call. No limit ceiling: this route never had one.
    const pagination = parsePagination(searchParams);
    if (!pagination.ok) {
      return NextResponse.json({ error: pagination.error }, { status: 400 });
    }
    const { page, limit } = pagination;

    let query = supabase
      .from('transport_requests')
      .select(`
        *,
        user:profiles!transport_requests_user_id_fkey (
          id,
          full_name,
          email
        ),
        quotes (count)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(pagination.from, pagination.to);

    if (status) {
      if (status === 'active') {
        query = query.in('status', ['pending', 'quoted']);
      } else {
        query = query.eq('status', status);
      }
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      requests: data,
      total: count,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    });
  } catch (error) {
    console.error('Error fetching requests:', error);
    return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
  }
}
