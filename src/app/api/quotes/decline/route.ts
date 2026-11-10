import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isOpenRequestStatus } from '@/lib/request-status';
import { transition } from '@/lib/transitions';

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require authentication — only the request owner may decline a quote.
    const supabaseUser = await createClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { quoteId } = await request.json();

    if (!quoteId) {
      return NextResponse.json(
        { error: 'Missing quoteId' },
        { status: 400 }
      );
    }

    // Get quote with its associated request to verify ownership
    const { data: quote } = await supabase
      .from('quotes')
      .select('operator_id, total_price, request_id, status')
      .eq('id', quoteId)
      .single();

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // SECURITY: Verify the authenticated user owns the transport request this quote belongs to
    const { data: transportRequest } = await supabase
      .from('transport_requests')
      .select('user_id, status')
      .eq('id', quote.request_id)
      .single();

    if (!transportRequest || transportRequest.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // LIFECYCLE GUARD (BUS-DECLINE-CLOSED-REQUEST-001): a decline is only
    // valid on an OPEN request (pending/quoted). Shared predicate:
    // src/lib/request-status.ts — applied by every quote-family route.
    if (!isOpenRequestStatus(transportRequest.status)) {
      return NextResponse.json({ error: 'Request is no longer active' }, { status: 409 });
    }

    // SECURITY: Only a pending quote may be declined — an accepted quote
    // is a live booking commitment and must not be flipped to declined
    // after the fact (same status guard as quote acceptance).
    if (quote.status !== 'pending') {
      return NextResponse.json(
        { error: `This quote is ${quote.status} and can no longer be declined.` },
        { status: 409 }
      );
    }

    // TRANSITION (BUS-DECLINE-ACCEPT-RACE-001): the status predicate
    // keeps the write fail-closed, and its OUTCOME is now checked — if
    // an accept landed between the read above and this write, the
    // update matches zero rows and the decline is refused with NO
    // operator notification, instead of reporting success while
    // flipping an accepted quote to declined.
    const declineTransition = await transition(supabase, {
      table: 'quotes',
      filters: [{ column: 'id', value: quoteId }],
      guardField: 'status',
      from: ['pending'],
      patch: { status: 'declined' },
      mode: 'single',
    });

    if (!declineTransition.ok) {
      if (declineTransition.kind === 'error') {
        return NextResponse.json(
          { error: (declineTransition.error as any)?.message || 'Failed to decline quote' },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: 'This quote is no longer pending and cannot be declined.' },
        { status: 409 }
      );
    }

    // Notify operator
    if (quote) {
      await supabase
        .from('notifications')
        .insert({
          user_id: quote.operator_id,
          type: 'quote_declined',
          title: 'Quote Declined',
          message: `Your quote for $${quote.total_price} was declined.`,
          data: { quote_id: quoteId }
        });
    }

    return NextResponse.json({
      success: true,
      message: 'Quote declined successfully',
      quoteId,
    });
  } catch (error) {
    console.error('Error declining quote:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
