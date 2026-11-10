import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/event-logger';
import { transition } from '@/lib/transitions';
import { OPEN_REQUEST_STATUSES } from '@/lib/request-status';
import Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * A dedupe-insert failure is a duplicate delivery only when it is a
 * unique violation (Postgres SQLSTATE 23505, surfaced by PostgREST as
 * the error code): a concurrent delivery recorded the event first.
 * Every other failure means the record was NOT written.
 */
function isUniqueViolation(error: any): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return /duplicate key|unique constraint/i.test(String(error.message || ''));
}

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
    await logEvent({
      event_type: 'webhook.signature_failed',
      status: 'error',
      actor_type: 'system',
      message: err.message,
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency check - ensure we process each event only once
  const { data: processedEvent } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .single();

  if (processedEvent) {
    // Duplicate event — already processed (idempotency)
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
    // CLAIM DISCIPLINE (BUS-WEBHOOK-DEDUPE-SWALLOW-001, M3): the
    // webhook_events insert IS the dedupe claim, and its outcome
    // decides whether this delivery may apply the event.
    if (isUniqueViolation(webhookError)) {
      // A concurrent delivery recorded the event first — the claim
      // already exists, so this delivery is a duplicate: do not apply
      // the event a second time.
      return NextResponse.json({ received: true, duplicate: true });
    }
    // Any other failure means the claim did NOT happen. Fail closed:
    // return a retryable 500 and do NOT apply the event. Applying it
    // unrecorded (the old behavior — log and fall through to a 200)
    // leaves no dedupe trace, so Stripe's redelivery of the same
    // event would apply it a second time. A 500 makes Stripe retry
    // after the record path recovers.
    await logEvent({
      event_type: 'webhook.db_error',
      status: 'error',
      actor_type: 'system',
      message: 'Failed to record stripe_event_id in webhook_events',
      metadata: { event_id: event.id, error: webhookError.message }
    });
    return NextResponse.json(
      { error: 'Failed to record webhook event' },
      { status: 500 }
    );
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const bookingId = paymentIntent.metadata.booking_id;

      if (bookingId) {
        // TRANSITION (BUS-WEBHOOK-PI-SUCCEEDED-TERMINAL-001): 'paid' may
        // only land on a LIVE booking. The update is predicated on the
        // booking still being confirmed/in_progress; a booking that was
        // cancelled or completed before this (possibly very late) event
        // matches zero rows and gains no paid state, no notifications,
        // and no PII reveal.
        const paidTransition = await transition(supabase, {
          table: 'bookings',
          filters: [{ column: 'id', value: bookingId }],
          guardField: 'status',
          from: ['confirmed', 'in_progress'],
          patch: { payment_status: 'paid' },
          select: 'user_id, operator_id, confirmation_code, amount',
          mode: 'single',
        });
        const booking = paidTransition.ok ? paidTransition.rows[0] : null;

        if (booking) {
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
              // PII reveal success logged via logEvent below
              await logEvent({
                event_type: 'booking.pii_reveal.success',
                actor_type: 'system',
                booking_id: bookingId,
                operator_id: booking.operator_id,
                user_id: booking.user_id,
                metadata: { to: tripData.operator.company_email }
              });
            } catch (emailErr) {
              // PII reveal failure logged via logEvent below
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
        // TRANSITION (BUS-WEBHOOK-PI-FAILED-SETTLED-001): 'failed' may
        // only land on a NON-SETTLED payment. The update is predicated
        // on payment_status still being unpaid/pending/processing; a
        // booking that already settled as 'paid' matches zero rows and
        // keeps its paid state (and its operator earnings), and no
        // failure notification is sent.
        const failedTransition = await transition(supabase, {
          table: 'bookings',
          filters: [{ column: 'id', value: bookingId }],
          guardField: 'payment_status',
          from: ['unpaid', 'pending', 'processing'],
          patch: { payment_status: 'failed' },
          select: 'user_id, confirmation_code',
          mode: 'single',
        });
        const booking = failedTransition.ok ? failedTransition.rows[0] : null;

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
        // FULL-REFUND GATE (BUS-WEBHOOK-REFUND-PARTIAL-001): Stripe sends
        // charge.refunded for partial refunds too. Only a FULL refund
        // (charge.refunded, or amount_refunded covering the charge) may
        // move a booking to the terminal 'refunded' state; a partial
        // refund leaves a paid booking paid and sends no refund notice.
        const isFullRefund =
          charge.refunded === true ||
          (typeof charge.amount_refunded === 'number' &&
            typeof charge.amount === 'number' &&
            charge.amount_refunded >= charge.amount);

        if (!isFullRefund) {
          await logEvent({
            event_type: 'webhook.charge.partial_refund',
            actor_type: 'system',
            message: 'Partial refund received; booking payment state unchanged',
            metadata: {
              payment_intent: paymentIntentId,
              amount: charge.amount,
              amount_refunded: charge.amount_refunded,
            }
          });
          break;
        }

        const { data: booking } = await supabase
          .from('bookings')
          .select('id, user_id, confirmation_code')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .single();

        if (booking) {
          // TRANSITION: 'refunded' only from a settled 'paid' state.
          const refundTransition = await transition(supabase, {
            table: 'bookings',
            filters: [{ column: 'id', value: booking.id }],
            guardField: 'payment_status',
            from: ['paid'],
            patch: { payment_status: 'refunded' },
            mode: 'single',
          });

          if (refundTransition.ok) {
            await supabase.from('notifications').insert({
              user_id: booking.user_id,
              type: 'payment_refunded',
              title: 'Refund Processed',
              message: `Your payment for booking ${booking.confirmation_code} has been refunded.`,
              data: { booking_id: booking.id }
            });
          }
        }
      }
      break;
    }

    // H2: Consolidated from /api/webhooks/stripe — handles priority fee checkout completion
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.metadata?.type === 'priority_fee' && session.metadata?.request_id) {
        const requestId = session.metadata.request_id;

        // TRANSITION (BUS-WEBHOOK-PRIORITY-CLOSED-001): the priority fee
        // may only land on an OPEN request. The update is predicated on
        // the request still being pending/quoted; a request that was
        // cancelled or completed before this late event matches zero
        // rows and gains no paid/priority state.
        const priorityTransition = await transition(supabase, {
          table: 'transport_requests',
          filters: [{ column: 'id', value: requestId }],
          guardField: 'status',
          from: OPEN_REQUEST_STATUSES,
          patch: {
            payment_status: 'paid',
            payment_intent_id: session.payment_intent as string,
            priority_until: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            routing_fee_amount: 1.99
          },
          mode: 'single',
        });

        if (!priorityTransition.ok && priorityTransition.kind === 'error') {
          await logEvent({
            event_type: 'webhook.checkout_session.db_error',
            status: 'error',
            actor_type: 'system',
            request_id: requestId,
            message: 'Failed to update transport request after priority fee payment',
            metadata: { error: (priorityTransition.error as any)?.message }
          });
        } else if (!priorityTransition.ok) {
          await logEvent({
            event_type: 'webhook.priority_fee.closed_request',
            status: 'error',
            actor_type: 'system',
            request_id: requestId,
            message: 'Priority fee arrived for a closed request; no state changed',
            metadata: { payment_intent: session.payment_intent }
          });
        } else {
          await logEvent({
            event_type: 'webhook.priority_fee.paid',
            actor_type: 'system',
            request_id: requestId,
            metadata: { payment_intent: session.payment_intent }
          });
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
