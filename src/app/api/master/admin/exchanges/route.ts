import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, requireAdmin } from '@/lib/supabase/admin';
import { parsePagination } from '@/lib/boundary';

// GET — return bookings pending manual PII exchange
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  // BOUNDARY (BUS-ADMIN-EXCHANGES-PAGINATION-001): shared pagination
  // parser, like every sibling admin list (default 20, max 50) — this
  // queue used to return every pending exchange in one unbounded
  // response and ignore page/limit entirely, making it the widest
  // single PII-exchange payload in the admin surface.
  const pagination = parsePagination(searchParams, { maxLimit: 50 });
  if (!pagination.ok) {
    return NextResponse.json({ error: pagination.error }, { status: 400 });
  }
  const { page, limit } = pagination;

  const { data, error, count } = await supabaseAdmin
    .from('bookings')
    .select(`
      id, created_at, amount, confirmation_code,
      request_id, operator_id, user_id,
      transport_requests ( id, service_type, pickup_fuzzy, dropoff_fuzzy, start_date ),
      quotes ( vehicle_type, total_price ),
      operators ( company_name, company_email )
    `, { count: 'exact' })
    .eq('requires_manual_exchange', true)
    .order('created_at', { ascending: false })
    .range(pagination.from, pagination.to);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    exchanges: data || [],
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}
