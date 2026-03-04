import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { verifyOperatorViewToken } from '@/lib/tokens';
import { logEvent } from '@/lib/event-logger';

/**
 * POST /api/quotes/pass
 *
 * Called when an operator indicates they cannot take a job.
 * Immediately flags the request in the Safety Valve tab for admin re-dispatch.
 */
export async function POST(req: NextRequest) {
  const { requestId, token } = await req.json();

  if (!requestId || !token) {
    return NextResponse.json({ error: 'requestId and token are required' }, { status: 400 });
  }

  // Validate the operator view token
  const payload = await verifyOperatorViewToken(token);
  if (!payload || payload.requestId !== requestId) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 403 });
  }

  const operatorId = payload.operatorId;

  // Fetch current metadata_private for read-modify-write
  const { data: request, error: fetchErr } = await supabaseAdmin
    .from('transport_requests')
    .select('status, metadata_private')
    .eq('id', requestId)
    .single();

  if (fetchErr || !request) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  if (request.status === 'booked' || request.status === 'cancelled') {
    return NextResponse.json({ error: 'Request is no longer active' }, { status: 409 });
  }

  // Flag for admin re-dispatch via Safety Valve
  const { error: updateErr } = await supabaseAdmin
    .from('transport_requests')
    .update({
      metadata_private: {
        ...request.metadata_private,
        requires_manual_allocation: true,
      },
    })
    .eq('id', requestId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await logEvent({
    event_type: 'operator.request.passed',
    actor_type: 'operator',
    operator_id: operatorId,
    request_id: requestId,
    metadata: { reason: 'operator_declined_via_email_link' },
  });

  return NextResponse.json({ success: true });
}
