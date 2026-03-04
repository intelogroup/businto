import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, requireAdmin } from '@/lib/supabase-server';

// GET — return bookings pending manual PII exchange
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select(`
      id, created_at, amount, confirmation_code,
      request_id, operator_id, user_id,
      transport_requests ( id, service_type, pickup_fuzzy, dropoff_fuzzy, start_date ),
      quotes ( vehicle_type, total_price ),
      operators ( company_name, company_email )
    `)
    .eq('requires_manual_exchange', true)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ exchanges: data || [] });
}
