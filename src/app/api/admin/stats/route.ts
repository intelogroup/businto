import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    // Get counts
    const [
      { count: usersCount },
      { count: operatorsCount },
      { count: activeRequestsCount },
      { count: bookingsCount },
      { data: revenueData }
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'user'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'operator'),
      supabase.from('transport_requests').select('*', { count: 'exact', head: true }).in('status', ['pending', 'quoted']),
      supabase.from('bookings').select('*', { count: 'exact', head: true }),
      supabase.from('bookings').select('amount').eq('payment_status', 'paid')
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
