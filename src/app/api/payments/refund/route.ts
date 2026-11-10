import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logEvent } from '@/lib/event-logger';
import { transition, isTerminalBookingStatus } from '@/lib/transitions';

/**
 * Refund Policy:
 * - Automatic refund if no operator accepts quote within 48 hours
 * - Manual refund if all quotes are declined/expired
 * - Check quote status (must be pending or accepted) - if withdrawn/declined, no refund
 * - Idempotent: uses booking_id as idempotency key
 */

export async function POST(request: NextRequest) {
  try {
    // ── Auth gate ───────────────────────────────────────────────────────
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => { /* read-only in route handler */ },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingId, reason = 'No operator response' } = await request.json();

    if (!bookingId) {
      return NextResponse.json(
        { error: 'Missing bookingId' },
        { status: 400 }
      );
    }

    // Get booking with quotes (ownership check: user must own the booking)
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        quotes (
          id,
          status,
          created_at
        )
      `)
      .eq('id', bookingId)
      .eq('user_id', user.id)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Check if already refunded
    if (booking.payment_status === 'refunded') {
      return NextResponse.json({
        success: true,
        message: 'Booking already refunded',
        alreadyRefunded: true
      });
    }

    // TERMINAL GUARD (BUS-REFUND-ON-COMPLETED-001): a completed or
    // cancelled booking is finished business — its payment must never be
    // refunded out from under the operator's earnings. Refuse BEFORE
    // any Stripe call, whatever reason string the client supplied.
    if (isTerminalBookingStatus(booking.status)) {
      return NextResponse.json(
        { error: `A ${booking.status} booking cannot be refunded` },
        { status: 409 }
      );
    }

    // Check if payment was made
    if (!booking.stripe_payment_intent_id || booking.payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'No payment to refund' },
        { status: 400 }
      );
    }

    // Validate refund eligibility based on quote status
    const hasValidQuotes = booking.quotes?.some((q: any) =>
      q.status === 'pending' || q.status === 'accepted'
    );

    if (!hasValidQuotes) {
      return NextResponse.json(
        { error: 'Refund not eligible: All quotes were withdrawn or declined' },
        { status: 400 }
      );
    }

    // Check 48-hour rule for refunds.
    // SECURITY (BUS-REFUND-GATE-001): eligibility is server-decided from the
    // booking's state and age alone. The client-supplied `reason` is a label
    // recorded in metadata/notifications — it must never gate or bypass this
    // check. Previously the gate applied only when reason === 'No operator
    // response', so any other wording refunded a minutes-old booking.
    const bookingCreatedAt = new Date(booking.created_at);
    const now = new Date();
    const hoursSinceCreation = (now.getTime() - bookingCreatedAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceCreation < 48) {
      return NextResponse.json(
        { error: 'Cannot refund before 48 hours' },
        { status: 400 }
      );
    }

    // Process refund with idempotency
    const refund = await stripe.refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      reason: 'requested_by_customer',
      metadata: {
        booking_id: bookingId,
        refund_reason: reason
      }
    }, {
      idempotencyKey: `refund-${bookingId}`
    });

    // Update booking status — TRANSITION: predicated on the payment
    // still being 'paid', outcome checked (a state change that landed
    // during the Stripe call refuses instead of being overwritten).
    const refundMark = await transition(supabase, {
      table: 'bookings',
      filters: [{ column: 'id', value: bookingId }],
      guardField: 'payment_status',
      from: ['paid'],
      patch: {
        payment_status: 'refunded',
        updated_at: new Date().toISOString()
      },
      mode: 'single',
    });
    if (!refundMark.ok) {
      console.error(`Refund recorded with Stripe but booking ${bookingId} no longer in 'paid' state:`, refundMark);
    }

    // Create notification for user
    const { data: userData } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', booking.user_id)
      .single();

    if (userData) {
      await supabase
        .from('notifications')
        .insert({
          user_id: userData.id,
          title: 'Refund Processed',
          message: `Your routing fee of $${booking.routing_fee_amount || 1.99} has been refunded. ${reason}`,
          type: 'payment',
          read: false
        });
    }

    return NextResponse.json({
      success: true,
      refundId: refund.id,
      amount: refund.amount / 100,
      status: refund.status
    });

  } catch (error: any) {
    await logEvent({
      event_type: 'payment.refund.error',
      status: 'error',
      actor_type: 'system',
      message: error.message || 'Failed to process refund',
    });

    // Handle duplicate refund attempts
    if (error.type === 'StripeInvalidRequestError' && error.message?.includes('already been refunded')) {
      return NextResponse.json({
        success: true,
        message: 'Payment already refunded',
        alreadyRefunded: true
      });
    }

    return NextResponse.json(
      { error: error.message || 'Failed to process refund' },
      { status: 500 }
    );
  }
}
