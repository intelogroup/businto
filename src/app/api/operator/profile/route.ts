import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, requireUser } from '@/lib/supabase-server';
import { logEvent } from '@/lib/event-logger';

/**
 * GET /api/operator/profile
 *
 * Returns the operator's profile data for the onboarding/completion flow.
 * Includes current completion status for each onboarding step.
 *
 * SECURITY: Authenticated operators only. Scoped to own profile.
 */
export async function GET() {
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

    // Fetch operator record
    const { data: operator, error: opError } = await supabaseAdmin
      .from('operators')
      .select('id, company_name, company_email, company_phone, specialties, service_radius_miles, service_areas, is_active, is_partner, is_verified, rating, total_reviews, created_at')
      .eq('id', operatorId)
      .single();

    if (opError || !operator) {
      return NextResponse.json(
        { error: 'Operator profile not found' },
        { status: 404 }
      );
    }

    // Compute completion checklist
    const completionStatus = {
      hasCompanyInfo: !!(operator.company_name && operator.company_email),
      hasSpecialties: Array.isArray(operator.specialties) && operator.specialties.length > 0,
      hasServiceRadius: typeof operator.service_radius_miles === 'number' && operator.service_radius_miles > 0,
      hasServiceAreas: Array.isArray(operator.service_areas) && operator.service_areas.length > 0,
      hasPhone: !!operator.company_phone,
      isActive: !!operator.is_active,
    };

    const completedSteps = Object.values(completionStatus).filter(Boolean).length;
    const totalSteps = Object.keys(completionStatus).length;
    const isProfileComplete = completedSteps === totalSteps;

    return NextResponse.json({
      operator,
      completionStatus,
      completedSteps,
      totalSteps,
      isProfileComplete,
    });
  } catch (error) {
    console.error('Error fetching operator profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/operator/profile
 *
 * Updates operator profile fields for the onboarding flow.
 * Accepts partial updates for: specialties, service_radius_miles,
 * service_areas, company_phone, company_name, company_email.
 *
 * SECURITY: Authenticated operators only. Scoped to own profile.
 */
export async function PATCH(request: NextRequest) {
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

    const body = await request.json();

    // Whitelist of fields operators can update via onboarding
    const allowedFields = [
      'company_name',
      'company_email',
      'company_phone',
      'specialties',
      'service_radius_miles',
      'service_areas',
    ];

    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Validate specialties if provided
    if (updateData.specialties) {
      const validSpecialties = ['school', 'medical', 'wedding', 'corporate'];
      if (!Array.isArray(updateData.specialties)) {
        return NextResponse.json(
          { error: 'Specialties must be an array' },
          { status: 400 }
        );
      }
      const invalid = updateData.specialties.filter(
        (s: string) => !validSpecialties.includes(s)
      );
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: `Invalid specialties: ${invalid.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Validate service_radius_miles
    if (updateData.service_radius_miles !== undefined) {
      const radius = Number(updateData.service_radius_miles);
      if (isNaN(radius) || radius < 1 || radius > 500) {
        return NextResponse.json(
          { error: 'Service radius must be between 1 and 500 miles' },
          { status: 400 }
        );
      }
      updateData.service_radius_miles = radius;
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('operators')
      .update(updateData)
      .eq('id', operatorId)
      .select('id, company_name, company_email, company_phone, specialties, service_radius_miles, service_areas, is_active')
      .single();

    if (updateError) {
      console.error('Operator profile update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    await logEvent({
      event_type: 'operator.profile.updated',
      actor_type: 'operator',
      actor_id: user.id,
      operator_id: operatorId,
      metadata: { updated_fields: Object.keys(updateData), source: 'onboarding' },
    });

    return NextResponse.json({
      success: true,
      operator: updated,
    });
  } catch (error) {
    console.error('Error updating operator profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
