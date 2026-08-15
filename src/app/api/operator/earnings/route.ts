import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, requireUser } from '@/lib/supabase-server';

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
    const monthParam = searchParams.get('month');

    // Fetch all completed bookings for this operator
    const query = supabaseAdmin
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

    // Filter by month if provided
    let filteredTrips = trips;
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
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
      trips: filteredTrips,
      monthlySummary,
      currentMonth: currentMonthData,
      allTimeTotal,
      totalTrips: trips.length,
    });
  } catch (error) {
    console.error('Error fetching operator earnings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
