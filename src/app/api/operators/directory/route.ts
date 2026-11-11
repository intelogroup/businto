import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { parsePagination } from '@/lib/boundary';

const VALID_SPECIALTIES = ['school', 'medical', 'wedding', 'corporate'] as const;

/**
 * GET /api/operators/directory
 *
 * Public endpoint — returns verified, active operators with optional
 * filtering by specialty and/or location keyword.
 *
 * Query params:
 *   specialty  — one of: school | medical | wedding | corporate
 *   location   — free-text search against service_areas
 *   page       — 1-based (default: 1)
 *   limit      — max 50 (default: 20)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const specialty = searchParams.get('specialty');
    const location = searchParams.get('location')?.trim() || '';
    // BOUNDARY (BUS-DIRECTORY-PAGINATION-001): one shared parser —
    // page/limit are positive integers or the request is refused 400
    // before any data-layer call (the old Math.max/Math.min clamps
    // propagated NaN from parseInt into .range(NaN, NaN) -> 500).
    const pagination = parsePagination(searchParams, { maxLimit: 50 });
    if (!pagination.ok) {
      return NextResponse.json({ error: pagination.error }, { status: 400 });
    }
    const { page, limit } = pagination;

    // Validate specialty filter
    if (specialty && !VALID_SPECIALTIES.includes(specialty as typeof VALID_SPECIALTIES[number])) {
      return NextResponse.json(
        { error: `Invalid specialty. Must be one of: ${VALID_SPECIALTIES.join(', ')}` },
        { status: 400 }
      );
    }

    let query = supabaseAdmin
      .from('operators')
      .select(
        'id, company_name, specialties, service_areas, service_radius_miles, rating, total_reviews, is_verified, is_partner, is_active',
        { count: 'exact' }
      )
      .eq('is_verified', true)
      .eq('is_active', true)
      .order('rating', { ascending: false })
      .range(pagination.from, pagination.to);

    if (specialty) {
      query = query.contains('specialties', [specialty]);
    }

    if (location) {
      // Case-insensitive substring match against any service area entry
      query = query.ilike('service_areas', `%${location}%`);
    }

    const { data: operators, error, count } = await query;

    if (error) {
      console.error('Error fetching operator directory:', error);
      return NextResponse.json({ error: 'Failed to fetch operators' }, { status: 500 });
    }

    return NextResponse.json({
      operators: operators || [],
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (error) {
    console.error('Operator directory error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
