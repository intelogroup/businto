import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, requireUser } from '@/lib/supabase/admin';
import { parseMonthParam, parsePagination } from '@/lib/boundary';

/**
 * GET /api/operator/earnings
 *
 * Returns earnings history for the authenticated operator:
 * - Completed trips with payout amounts
 * - Monthly earnings summary
 * - All-time total
 *
 * Query params:
 *   month (optional) — YYYY-MM to filter a specific month
 *   page / limit (optional) — trips list page (default 20, max 50);
 *     monthly summary and all-time totals always cover ALL trips
 *
 * SECURITY: Scoped to the operator's own data via operator_profiles -> operators link.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve operator company ID
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

    // Parse optional month filter (YYYY-MM)
    const { searchParams } = new URL(request.url);
    // BOUNDARY (BUS-EARNINGS-MONTH-FILTER-001): a supplied month is
    // parsed by the shared parser — valid YYYY-MM or refused 400
    // before the earnings fetch. The old regex apply-gate silently
    // dropped near-miss shapes and returned the unfiltered list.
    const parsedMonth = parseMonthParam(searchParams.get('month'));
    if (!parsedMonth.ok) {
      return NextResponse.json({ error: parsedMonth.error }, { status: 400 });
    }
    const monthParam = parsedMonth.value;

    // BOUNDARY (BUS-EARNINGS-PAGINATION-001): the trips list is paged
    // with the shared parser like every sibling list (default 20,
    // max 50) — the aggregates below are still computed over the
    // FULL trip set; only the returned list is sliced.
    const pagination = parsePagination(searchParams, { maxLimit: 50 });
    if (!pagination.ok) {
      return NextResponse.json({ error: pagination.error }, { status: 400 });
    }
    const { page, limit } = pagination;

    // Fetch all completed bookings for this operator
    let query = supabaseAdmin
      .from('bookings')
      .select(`
        id, confirmation_code, status, payment_status, amount, created_at,
        request:transport_requests (
          id, service_type, pickup_fuzzy, dropoff_fuzzy, start_date, start_time
        )
      `)
      .eq('operator_id', operatorId)
      .eq('status', 'completed')
      .eq('payment_status', 'paid')
      .order('created_at', { ascending: false });

    const { data: completedBookings, error: bookingsError } = await query;

    if (bookingsError) {
      console.error('Error fetching operator earnings:', bookingsError);
      return NextResponse.json(
        { error: 'Failed to fetch earnings' },
        { status: 500 }
      );
    }

    const allBookings = completedBookings || [];

    // Build per-trip earnings list
    const trips = allBookings.map((b: any) => ({
      id: b.id,
      confirmationCode: b.confirmation_code,
      amount: b.amount || 0,
      serviceType: b.request?.service_type || 'transport',
      pickupFuzzy: b.request?.pickup_fuzzy || '',
      dropoffFuzzy: b.request?.dropoff_fuzzy || '',
      startDate: b.request?.start_date || null,
      startTime: b.request?.start_time || null,
      completedAt: b.created_at,
    }));

    // Filter by month if provided (already validated above — a
    // supplied month always filters, never silently widens)
    let filteredTrips = trips;
    if (monthParam) {
      filteredTrips = trips.filter((t: any) => {
        const tripMonth = t.completedAt?.substring(0, 7);
        return tripMonth === monthParam;
      });
    }

    // Calculate monthly totals across all bookings
    const monthlyTotals: Record<string, { month: string; total: number; tripCount: number }> = {};
    for (const trip of trips) {
      const month = trip.completedAt?.substring(0, 7) || 'unknown';
      if (!monthlyTotals[month]) {
        monthlyTotals[month] = { month, total: 0, tripCount: 0 };
      }
      monthlyTotals[month].total += trip.amount;
      monthlyTotals[month].tripCount += 1;
    }

    // Sort months descending
    const monthlySummary = Object.values(monthlyTotals).sort(
      (a, b) => b.month.localeCompare(a.month)
    );

    // Current month stats
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentMonthData = monthlyTotals[currentMonth] || { month: currentMonth, total: 0, tripCount: 0 };

    // All-time total
    const allTimeTotal = trips.reduce((sum: number, t: any) => sum + t.amount, 0);

    return NextResponse.json({
      trips: filteredTrips.slice(pagination.from, pagination.to + 1),
      monthlySummary,
      currentMonth: currentMonthData,
      allTimeTotal,
      totalTrips: trips.length,
      total: filteredTrips.length,
      page,
      limit,
      totalPages: Math.ceil(filteredTrips.length / limit),
    });
  } catch (error) {
    console.error('Error fetching operator earnings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
