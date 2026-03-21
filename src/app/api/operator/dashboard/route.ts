import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, requireUser } from '@/lib/supabase-server';

/**
 * GET /api/operator/dashboard
 *
 * Returns aggregated dashboard data for the authenticated operator:
 * - Pending job requests (matching their service area)
 * - Their submitted quotes (with request details)
 * - Active bookings (where they are the assigned operator)
 * - Earnings summary
 *
 * SECURITY: Scoped to the operator's own data via operator_profiles -> operators link.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve the operator company ID from the authenticated user
    const { data: opProfile } = await supabaseAdmin
      .from('operator_profiles')
      .select('operator_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!opProfile?.operator_id) {
      // Check if user is directly an operator (legacy)
      const { data: directOp } = await supabaseAdmin
        .from('operators')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (!directOp) {
        return NextResponse.json(
          { error: 'Not an operator. This dashboard is for registered operators only.' },
          { status: 403 }
        );
      }
    }

    const operatorId = opProfile?.operator_id || user.id;

    // Fetch operator company info
    const { data: operator } = await supabaseAdmin
      .from('operators')
      .select('id, company_name, company_email, rating, total_reviews, is_partner, specialties, service_radius_miles')
      .eq('id', operatorId)
      .single();

    // Fetch quotes with request details (operator's quote history)
    const { data: quotes } = await supabaseAdmin
      .from('quotes')
      .select(`
        id, total_price, vehicle_type, status, note, created_at,
        request:transport_requests (
          id, service_type, pickup_fuzzy, dropoff_fuzzy, start_date, start_time, status
        )
      `)
      .eq('operator_id', operatorId)
      .order('created_at', { ascending: false })
      .limit(50);

    // Fetch active bookings (operator is assigned)
    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select(`
        id, confirmation_code, status, payment_status, amount, created_at,
        request:transport_requests (
          id, service_type, pickup_fuzzy, dropoff_fuzzy, pickup_address, dropoff_address,
          start_date, start_time, metadata_safe
        )
      `)
      .eq('operator_id', operatorId)
      .order('created_at', { ascending: false })
      .limit(50);

    // Calculate earnings from completed/paid bookings
    const completedBookings = (bookings || []).filter(
      (b: any) => b.status === 'completed' && b.payment_status === 'paid'
    );
    const totalEarnings = completedBookings.reduce((sum: number, b: any) => sum + (b.amount || 0), 0);
    const activeBookings = (bookings || []).filter(
      (b: any) => ['confirmed', 'in_progress'].includes(b.status)
    );

    // Categorize quotes
    const pendingQuotes = (quotes || []).filter((q: any) => q.status === 'pending');
    const acceptedQuotes = (quotes || []).filter((q: any) => q.status === 'accepted');

    return NextResponse.json({
      operator,
      stats: {
        totalQuotes: (quotes || []).length,
        pendingQuotes: pendingQuotes.length,
        acceptedQuotes: acceptedQuotes.length,
        activeBookings: activeBookings.length,
        completedTrips: completedBookings.length,
        totalEarnings,
      },
      quotes: quotes || [],
      bookings: bookings || [],
    });
  } catch (error) {
    console.error('Error fetching operator dashboard:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
