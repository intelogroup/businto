import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin as supabase } from '@/lib/supabase-server';
import Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency check - ensure we process each event only once
  const { data: processedEvent } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .single();

  if (processedEvent) {
    console.log(`Event ${event.id} already processed, skipping`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Record event processing
  const { error: webhookError } = await supabase
    .from('webhook_events')
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      processed_at: new Date().toISOString()
    });

  if (webhookError) {
    console.error('Failed to record webhook event:', webhookError);
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const bookingId = paymentIntent.metadata.booking_id;

      if (bookingId) {
        // Update booking payment status
        const { data: booking, error } = await supabase
          .from('bookings')
          .update({ payment_status: 'paid' })
          .eq('id', bookingId)
          .select('user_id, operator_id, confirmation_code, amount')
          .single();

        if (!error && booking) {
          // Notify user
          await supabase.from('notifications').insert({
            user_id: booking.user_id,
            type: 'payment_success',
            title: 'Payment Successful',
            message: `Payment of $${booking.amount} for booking ${booking.confirmation_code} completed.`,
            data: { booking_id: bookingId }
          });

          // Notify operator
          await supabase.from('notifications').insert({
            user_id: booking.operator_id,
            type: 'payment_received',
            title: 'Payment Received',
            message: `Payment of $${booking.amount} received for booking ${booking.confirmation_code}.`,
            data: { booking_id: bookingId }
          });
        }
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const bookingId = paymentIntent.metadata.booking_id;

      if (bookingId) {
        await supabase
          .from('bookings')
          .update({ payment_status: 'failed' })
          .eq('id', bookingId);

        const { data: booking } = await supabase
          .from('bookings')
          .select('user_id, confirmation_code')
          .eq('id', bookingId)
          .single();

        if (booking) {
          await supabase.from('notifications').insert({
            user_id: booking.user_id,
            type: 'payment_failed',
            title: 'Payment Failed',
            message: `Payment for booking ${booking.confirmation_code} failed. Please try again.`,
            data: { booking_id: bookingId }
          });
        }
      }
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = charge.payment_intent as string;

      if (paymentIntentId) {
        const { data: booking } = await supabase
          .from('bookings')
          .select('id, user_id, confirmation_code')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .single();

        if (booking) {
          await supabase
            .from('bookings')
            .update({ payment_status: 'refunded' })
            .eq('id', booking.id);

          await supabase.from('notifications').insert({
            user_id: booking.user_id,
            type: 'payment_refunded',
            title: 'Refund Processed',
            message: `Your payment for booking ${booking.confirmation_code} has been refunded.`,
            data: { booking_id: booking.id }
          });
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
