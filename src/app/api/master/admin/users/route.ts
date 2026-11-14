import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, requireAdmin } from '@/lib/supabase/admin';
import { parseEnumParam, parsePagination, parsePlainObject, parseSearchTerm } from '@/lib/boundary';

// The profile role vocabulary (src/lib/auth.ts): the only values a
// role filter can legitimately name.
const VALID_ROLES = ['user', 'operator', 'manager', 'admin'] as const;

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    // BOUNDARY: the role filter is a member of the role vocabulary
    // before it reaches .eq() — a supplied value outside it is
    // refused 400 instead of failing closed by accident (empty 200).
    const parsedRole = parseEnumParam(searchParams.get('role'), 'role', VALID_ROLES);
    if (!parsedRole.ok) {
      return NextResponse.json({ error: parsedRole.error }, { status: 400 });
    }
    const role = parsedRole.value;
    // BOUNDARY (BUS-ADMIN-USERS-SEARCH-INJECTION-001): the search
    // term is parsed for the or() string it is about to enter —
    // LIKE wildcards escaped, PostgREST grammar characters refused
    // 400 — so it stays a literal substring match over the three
    // named columns and can never add a clause on another column.
    const rawSearch = searchParams.get('search');
    let search: string | null = null;
    if (rawSearch) {
      const parsedSearch = parseSearchTerm(rawSearch, { orString: true });
      if (!parsedSearch.ok) {
        return NextResponse.json({ error: parsedSearch.error }, { status: 400 });
      }
      search = parsedSearch.value;
    }
    // BOUNDARY (BUS-ADMIN-USERS-PAGINATION-001): shared pagination
    // parser — malformed/non-positive page/limit refused 400 before
    // any data-layer call (raw parseInt propagated NaN into .range()).
    // No limit ceiling: this route never had one.
    const pagination = parsePagination(searchParams);
    if (!pagination.ok) {
      return NextResponse.json({ error: pagination.error }, { status: 400 });
    }
    const { page, limit } = pagination;

    let query = supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(pagination.from, pagination.to);

    if (role) {
      query = query.eq('role', role);
    }

    if (search) {
      query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%,company_name.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      users: data,
      total: count,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId, updates } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // BOUNDARY (BUS-ADMIN-USERS-UPDATES-SHAPE-001): `updates` must be a
    // plain object before its keys are read — missing/null updates
    // threw a 500 from Object.keys, and string/number/array shapes
    // issued an empty {} update while reporting success.
    const parsedUpdates = parsePlainObject(updates, 'updates');
    if (!parsedUpdates.ok) {
      return NextResponse.json({ error: parsedUpdates.error }, { status: 400 });
    }
    const updatesObject = parsedUpdates.value;

    // Validate allowed fields — role escalation is intentionally restricted here
    const allowedFields = ['role', 'is_verified', 'cori_verified', 'insurance_verified'];
    const filteredUpdates: Record<string, unknown> = {};
    for (const key of Object.keys(updatesObject)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updatesObject[key];
      }
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(filteredUpdates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: data });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
