import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, requireUser } from '@/lib/supabase-server';
import { logEvent } from '@/lib/event-logger';

/**
 * GET /api/operator/availability
 *
 * Returns the operator's current availability status (is_accepting_requests).
 *
 * SECURITY: Authenticated operators only. Scoped to own profile.
 */
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const operatorId = await resolveOperatorId(user.id);
    if (!operatorId) {
      return NextResponse.json({ error: 'Not an operator' }, { status: 403 });
    }

    const { data: operator, error } = await supabaseAdmin
      .from('operators')
      .select('is_accepting_requests')
      .eq('id', operatorId)
      .single();

    if (error || !operator) {
      return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
    }

    return NextResponse.json({
      isAcceptingRequests: operator.is_accepting_requests ?? true,
    });
  } catch (error) {
    console.error('Error fetching operator availability:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/operator/availability
 *
 * Toggles the operator's availability to receive new requests.
 * Body: { isAcceptingRequests: boolean }
 *
 * SECURITY: Authenticated operators only. Scoped to own profile.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const operatorId = await resolveOperatorId(user.id);
    if (!operatorId) {
      return NextResponse.json({ error: 'Not an operator' }, { status: 403 });
    }

    const body = await request.json();
    const { isAcceptingRequests } = body;

    if (typeof isAcceptingRequests !== 'boolean') {
      return NextResponse.json(
        { error: 'isAcceptingRequests must be a boolean' },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('operators')
      .update({ is_accepting_requests: isAcceptingRequests })
      .eq('id', operatorId)
      .select('is_accepting_requests')
      .single();

    if (updateError) {
      console.error('Operator availability update error:', updateError);
      return NextResponse.json({ error: 'Failed to update availability' }, { status: 500 });
    }

    await logEvent({
      event_type: isAcceptingRequests
        ? 'operator.availability.resumed'
        : 'operator.availability.paused',
      actor_type: 'operator',
      actor_id: user.id,
      operator_id: operatorId,
      metadata: { is_accepting_requests: isAcceptingRequests },
    });

    return NextResponse.json({
      success: true,
      isAcceptingRequests: updated.is_accepting_requests,
    });
  } catch (error) {
    console.error('Error updating operator availability:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Resolve the operator company ID from a user's auth ID.
 * Checks operator_profiles first (staff), then operators directly (legacy).
 */
async function resolveOperatorId(userId: string): Promise<string | null> {
  const { data: opProfile } = await supabaseAdmin
    .from('operator_profiles')
    .select('operator_id')
    .eq('id', userId)
    .maybeSingle();

  if (opProfile?.operator_id) return opProfile.operator_id;

  const { data: directOp } = await supabaseAdmin
    .from('operators')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  return directOp?.id || null;
}
