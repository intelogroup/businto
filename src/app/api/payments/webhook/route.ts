import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin as supabase } from '@/lib/supabase-server';
import { logEvent } from '@/lib/event-logger';
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
    await logEvent({
      event_type: 'webhook.db_error',
      status: 'error',
      actor_type: 'system',
      message: 'Failed to record stripe_event_id in webhook_events',
      metadata: { event_id: event.id, error: webhookError.message }
    });
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

          // PII REVEAL GATE: Send official order details to operator now that payment is confirmed
          const { data: tripData } = await supabase
            .from('bookings')
            .select(`
              *,
              request:transport_requests(*),
              operator:operators(*),
              user:profiles(email, full_name, phone)
            `)
            .eq('id', bookingId)
            .single();

          if (tripData?.request && tripData?.operator?.company_email) {
            const { sendEmail, emailTemplates, getAppBaseUrl } = await import('@/lib/email');
            const appBaseUrl = getAppBaseUrl();
            const privateMetadata = tripData.request.metadata_private || {};

            try {
              await sendEmail({
                to: tripData.operator.company_email,
                ...emailTemplates.operatorOrderDetails({
                  operatorName: tripData.operator.company_name || 'Operator',
                  parentName: privateMetadata.parent_name || privateMetadata.contact_name || tripData.user?.full_name || 'Not provided',
                  parentEmail: privateMetadata.parent_email || privateMetadata.contact_email || tripData.user?.email,
                  parentPhone: privateMetadata.parent_phone || privateMetadata.contact_phone || tripData.user?.phone || 'Not provided',
                  quoteAmount: tripData.amount,
                  pickup: tripData.request.pickup_address || tripData.request.pickup_fuzzy || 'Not specified',
                  dropoff: tripData.request.dropoff_address || tripData.request.dropoff_fuzzy || 'Not specified',
                  date: tripData.request.start_date,
                  time: tripData.request.start_time,
                  vehicleType: tripData.request.vehicle_type || 'Standard',
                  confirmationCode: tripData.confirmation_code || 'PENDING',
                  bookingId: tripData.id,
                  appBaseUrl
                })
              });
              console.log(`[PII Reveal] Contact info sent to operator for booking ${bookingId}`);
              await logEvent({
                event_type: 'booking.pii_reveal.success',
                actor_type: 'system',
                booking_id: bookingId,
                operator_id: booking.operator_id,
                user_id: booking.user_id,
                metadata: { to: tripData.operator.company_email }
              });
            } catch (emailErr) {
              console.error('[PII Reveal] Failed to send operator details:', emailErr);
              await logEvent({
                event_type: 'booking.pii_reveal.failed',
                status: 'error',
                actor_type: 'system',
                booking_id: bookingId,
                message: emailErr instanceof Error ? emailErr.message : 'Unknown email error',
                metadata: { to: tripData.operator.company_email }
              });
            }
          }
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
