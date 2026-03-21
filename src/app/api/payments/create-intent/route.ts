import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin as supabase } from '@/lib/supabase-server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logEvent } from '@/lib/event-logger';

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

    // Create payment intent for routing fee only
    // Note: booking.amount contains operator's quote but they're paid separately
    const paymentIntent = await stripe.paymentIntents.create({
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

    // Update booking with payment intent ID and routing fee
    await supabase
      .from('bookings')
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        routing_fee_amount: ROUTING_FEE
      })
      .eq('id', bookingId);

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
      actor_type: 'user',
      actor_id: user?.id,
      message: error.message || 'Failed to create payment intent',
    });
    return NextResponse.json(
      { error: error.message || 'Failed to create payment intent' },
      { status: 500 }
    );
  }
}
