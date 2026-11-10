import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifyOperatorViewToken } from '@/lib/tokens';
import { logEvent } from '@/lib/event-logger';
import { isOpenRequestStatus, OPEN_REQUEST_STATUSES } from '@/lib/request-status';
import { mergeMetadata } from '@/lib/transitions';

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

  // LIFECYCLE GUARD (BUS-PASS-CLOSED-REQUEST-001): a pass is only valid
  // on an OPEN request (pending/quoted). The previous booked/cancelled
  // check omitted 'completed', flagging finished trips for re-dispatch.
  // Shared predicate: src/lib/request-status.ts — applied by every
  // quote-family route.
  if (!isOpenRequestStatus(request.status)) {
    return NextResponse.json({ error: 'Request is no longer active' }, { status: 409 });
  }

  // Flag for admin re-dispatch via Safety Valve — METADATA MERGE
  // (BUS-PASS-CLOBBER-001): never write back the snapshot read above.
  // mergeMetadata claims the request with a predicated touch, re-reads
  // it, and merges the flag into the FRESH metadata object through a
  // write predicated on the fresh state — a booking landing inside the
  // old read→write window refuses the flag, and a metadata key written
  // concurrently (e.g. a priority-payment marker) survives.
  const merged = await mergeMetadata(supabaseAdmin, {
    table: 'transport_requests',
    id: requestId,
    from: OPEN_REQUEST_STATUSES,
    additions: { requires_manual_allocation: true },
  });

  if (!merged.ok) {
    if (merged.kind === 'error') {
      return NextResponse.json(
        { error: (merged.error as any)?.message || 'Failed to flag request' },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: 'Request is no longer active' }, { status: 409 });
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
