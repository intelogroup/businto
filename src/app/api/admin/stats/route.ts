import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    // ── Auth guard: only admins may access stats ──────────────────────────
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // ─────────────────────────────────────────────────────────────────────

    const [
      { count: usersCount },
      { count: operatorsCount },
      { count: activeRequestsCount },
      { count: bookingsCount },
      { data: revenueData }
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'user'),
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'operator'),
      supabaseAdmin.from('transport_requests').select('*', { count: 'exact', head: true }).in('status', ['pending', 'quoted']),
      supabaseAdmin.from('bookings').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('bookings').select('amount').eq('payment_status', 'paid')
    ]);

    const totalRevenue = revenueData?.reduce((sum, b) => sum + (b.amount || 0), 0) || 0;

    return NextResponse.json({
      stats: {
        users: usersCount || 0,
        operators: operatorsCount || 0,
        activeRequests: activeRequestsCount || 0,
        totalBookings: bookingsCount || 0,
        totalRevenue
      }
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
