import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

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
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));

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
      .range((page - 1) * limit, page * limit - 1);

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
