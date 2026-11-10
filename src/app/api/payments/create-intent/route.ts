import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logEvent } from '@/lib/event-logger';
import { transition } from '@/lib/transitions';

// Platform routing fee - this is what we charge requesters to connect them with operators
// Operators are paid separately outside the platform
const ROUTING_FEE = 1.99;

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

    const { bookingId, currency = 'usd' } = await request.json();

    if (!bookingId) {
      return NextResponse.json(
        { error: 'Missing bookingId' },
        { status: 400 }
      );
    }

    // Get booking details (ownership check: user must own the booking)
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        user:profiles!bookings_user_id_fkey (email, full_name),
        operator:profiles!bookings_operator_id_fkey (company_name)
      `)
      .eq('id', bookingId)
      .eq('user_id', user.id)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // ── State gate (BUS-CREATE-INTENT-STATE-001) ───────────────────────
    // A routing-fee intent may be created only for a live, unpaid
    // booking — the contract the sibling payment routes already state:
    // booking-checkout refuses payment_status 'paid' outright and
    // CAS-claims only 'unpaid'/'pending'; seamless does the same; the
    // refund route treats 'refunded' as the fee's terminal state and
    // refunds against the stored stripe_payment_intent_id, which this
    // route must never overwrite once the fee has been collected.
    // Refuse BEFORE any Stripe call and before touching the stored
    // intent id when:
    //   - the booking itself is terminal: status 'cancelled' or
    //     'completed' (a trip that will not run, or already ran), or
    //   - the fee is settled or already claimed by another payment
    //     path: payment_status 'paid', 'refunded', or 'processing'.
    // Still allowed, exactly as before (the PaymentModal flow):
    // payment_status 'unpaid' or 'pending', and 'failed' — the
    // webhook's payment_failed state, whose designed recovery is
    // re-entering this route from the payment modal.
    if (
      booking.status === 'cancelled' ||
      booking.status === 'completed' ||
      booking.payment_status === 'paid' ||
      booking.payment_status === 'refunded' ||
      booking.payment_status === 'processing'
    ) {
      return NextResponse.json(
        { error: 'Booking is not payable in its current state' },
        { status: 409 }
      );
    }

    // ── Claim (BUS-CREATE-INTENT-STATE-001 residual, M3) ───────────
    // The gate above still refuses settled/terminal states from the
    // initial read, but a read cannot HOLD a state: two concurrent
    // calls both passed the gate on the same 'unpaid' read, each
    // minted a Stripe intent, and the second (unpredicated) store
    // overwrote the first — two live intents, one stored id. The gate
    // is now backed by the sibling routes' DB-level claim discipline:
    //   1. CLAIM — one update predicated on payment_status IN
    //      ('unpaid','pending','failed') flips the booking to
    //      'processing'. Exactly one concurrent caller can win it;
    //      a refused claim makes NO Stripe call.
    //   2. WORK — create the Stripe intent. Sequencing choice: the
    //      intent is created only AFTER a successful claim, never
    //      before — the intent id cannot exist before the intent, so
    //      the claim flips the state first and the id is stored by
    //      the commit; the alternative (create first, void on
    //      refusal) would mint a Stripe object for every refused
    //      call, the exact cost the gate exists to prevent.
    //   3. COMMIT — store the intent id through an update predicated
    //      on the claim state, restoring the pre-claim payment_status:
    //      a created intent is not yet a payment in flight (the modal
    //      confirms it; the webhook settles paid/failed), so the
    //      booking's stored end state is identical to the pre-claim
    //      flow. If the Stripe call fails, the claim is RELEASED back
    //      to the pre-claim state instead.
    const claimedFrom = booking.payment_status as string;
    const claim = await transition(supabase, {
      table: 'bookings',
      filters: [{ column: 'id', value: bookingId }],
      guardField: 'payment_status',
      from: ['unpaid', 'pending', 'failed'],
      patch: { payment_status: 'processing' },
    });
    if (!claim.ok) {
      if (claim.kind === 'error') {
        throw new Error('Payment claim failed, please retry');
      }
      // Lost the race: another payment path claimed (or settled) the
      // booking between the read and the claim. Refuse with the
      // gate's own answer; no Stripe call was made.
      return NextResponse.json(
        { error: 'Booking is not payable in its current state' },
        { status: 409 }
      );
    }

    // Create payment intent for routing fee only
    // Note: booking.amount contains operator's quote but they're paid separately
    let paymentIntent: import('stripe').Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(ROUTING_FEE * 100), // Convert $1.99 to cents
        currency,
        metadata: {
          booking_id: bookingId,
          confirmation_code: booking.confirmation_code,
          routing_fee: ROUTING_FEE.toString(),
          operator_quote: booking.amount.toString()
        },
        description: `Routing Fee - Booking ${booking.confirmation_code}`,
        receipt_email: booking.user?.email
      });
    } catch (stripeErr) {
      // RELEASE the claim, predicated on the claim state, so the
      // booking returns to exactly its pre-claim payable state.
      await transition(supabase, {
        table: 'bookings',
        filters: [{ column: 'id', value: bookingId }],
        guardField: 'payment_status',
        from: ['processing'],
        patch: { payment_status: claimedFrom },
      });
      throw stripeErr;
    }

    // COMMIT — store the intent id under the claim predicate and
    // restore the pre-claim payment state (see the claim comment).
    // The outcome is checked and logged; the response is the same as
    // the pre-claim flow's, whose store was unchecked.
    const commit = await transition(supabase, {
      table: 'bookings',
      filters: [{ column: 'id', value: bookingId }],
      guardField: 'payment_status',
      from: ['processing'],
      patch: {
        stripe_payment_intent_id: paymentIntent.id,
        routing_fee_amount: ROUTING_FEE,
        payment_status: claimedFrom,
      },
    });
    if (!commit.ok) {
      await logEvent({
        event_type: 'payment.create_intent.claim_commit_failed',
        status: 'error',
        actor_type: 'system',
        booking_id: bookingId,
        message: 'Intent created but the claim commit did not land; webhook settlement keys on booking_id metadata',
        metadata: { payment_intent_id: paymentIntent.id },
      });
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      routingFee: ROUTING_FEE,
      operatorQuote: booking.amount
    });
  } catch (error: any) {
    await logEvent({
      event_type: 'payment.create_intent.error',
      status: 'error',
      actor_type: 'system',
      message: error.message || 'Failed to create payment intent',
    });
    return NextResponse.json(
      { error: error.message || 'Failed to create payment intent' },
      { status: 500 }
    );
  }
}
