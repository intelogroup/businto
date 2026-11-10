import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAppBaseUrl } from '@/lib/email';
import { logEvent } from '@/lib/event-logger';
import { isTerminalBookingStatus } from '@/lib/transitions';

const ROUTING_FEE = 1.99;

export async function POST(request: NextRequest) {
    let bookingId: string | undefined;
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

        ({ bookingId } = await request.json());

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
        user:profiles!bookings_user_id_fkey (id, email, full_name, stripe_customer_id),
        operator:profiles!bookings_operator_id_fkey (company_name)
      `)
            .eq('id', bookingId)
            .eq('user_id', user.id)
            .single();

        if (bookingError || !booking) {
            return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
        }

        // IDEMPOTENCY: Prevent creating a checkout session if already paid (C3).
        if (booking.payment_status === 'paid') {
            const appUrl = getAppBaseUrl();
            return NextResponse.json({
                url: `${appUrl}/trips/${booking.request_id}?payment=success`,
                alreadyPaid: true,
            });
        }

        // TERMINAL GUARD (BUS-PAYMENT-ON-CANCELLED-001, Phase 1 half):
        // a cancelled or completed booking must never be charged. The
        // claim discipline below stays as-is (Phase 2); what was missing
        // is that the claim only looked at payment_status, so a terminal
        // booking with an unpaid fee still claimed and charged.
        if (isTerminalBookingStatus(booking.status)) {
            return NextResponse.json(
                { error: `A ${booking.status} booking cannot be charged` },
                { status: 409 }
            );
        }

        // Atomic CAS: claim this booking for checkout by setting payment_status
        // to 'processing'. If another payment path (seamless) already claimed it,
        // the WHERE clause won't match and we get zero updated rows.
        const { data: claimed, error: claimErr } = await supabase
            .from('bookings')
            .update({ payment_status: 'processing' })
            .eq('id', bookingId)
            .in('payment_status', ['unpaid', 'pending'])
            .select('id');

        if (claimErr || !claimed || claimed.length === 0) {
            // CLAIM DISCIPLINE (BUS-PAYMENT-CLAIM-FALSE-SUCCESS-001,
            // M3): a failed claim — zero rows OR a database error — is
            // answered from the booking's REAL payment state, never
            // mapped to alreadyPaid blind. Re-read, then answer:
            //   'paid'       → the fee settled via another path while
            //                  we raced it: the existing alreadyPaid
            //                  success answer.
            //   'processing' → another path holds the claim right now:
            //                  an in-progress answer, NOT alreadyPaid.
            //   anything else → an error (500 when the claim itself
            //                  errored and the state is still payable —
            //                  the caller may retry; 409 when the state
            //                  is settled non-paid, e.g. failed/refunded).
            const { data: fresh } = await supabase
                .from('bookings')
                .select('payment_status')
                .eq('id', bookingId)
                .single();
            const freshStatus = (fresh as any)?.payment_status as string | undefined;
            if (freshStatus === 'paid') {
                const appUrl = getAppBaseUrl();
                return NextResponse.json({
                    url: `${appUrl}/trips/${booking.request_id}?payment=success`,
                    alreadyPaid: true,
                });
            }
            if (freshStatus === 'processing') {
                return NextResponse.json(
                    { error: 'A payment is already in progress for this booking', inProgress: true },
                    { status: 409 }
                );
            }
            if (claimErr) {
                return NextResponse.json(
                    { error: 'Payment claim failed, please retry' },
                    { status: 500 }
                );
            }
            return NextResponse.json(
                { error: `Booking payment is ${freshStatus ?? 'unknown'} and cannot be charged` },
                { status: 409 }
            );
        }

        const appUrl = getAppBaseUrl();

        // ── Stripe Customer: create or reuse ──────────────────────────────────
        let stripeCustomerId: string | undefined = booking.user?.stripe_customer_id || undefined;

        if (!stripeCustomerId && booking.user?.email) {
            // Check if a Stripe Customer already exists for this email (safety net)
            const existing = await stripe.customers.list({ email: booking.user.email, limit: 1 });
            if (existing.data.length > 0) {
                stripeCustomerId = existing.data[0].id;
            } else {
                const customer = await stripe.customers.create({
                    email: booking.user.email,
                    name: booking.user.full_name || undefined,
                    metadata: { supabase_user_id: booking.user.id },
                });
                stripeCustomerId = customer.id;
            }

            // Persist to profiles so future checkouts skip this step
            if (booking.user?.id) {
                await supabase
                    .from('profiles')
                    .update({ stripe_customer_id: stripeCustomerId })
                    .eq('id', booking.user.id);
            }
        }

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'Platform Routing Fee',
                            description: `Booking Confirmation: ${booking.confirmation_code}`,
                        },
                        unit_amount: Math.round(ROUTING_FEE * 100),
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${appUrl}/trips/${booking.request_id}?payment=success`,
            cancel_url: `${appUrl}/trips/${booking.request_id}?payment=cancelled`,
            // Attach customer (enables saved cards) — fall back to email hint for guests
            ...(stripeCustomerId
                ? { customer: stripeCustomerId }
                : { customer_email: booking.user?.email }),
            payment_intent_data: {
                // Vault card after first payment so future charges can be off-session
                setup_future_usage: 'off_session',
                metadata: {
                    booking_id: bookingId,
                }
            },
            metadata: {
                booking_id: bookingId,
                type: 'booking_routing_fee'
            }
        }, {
            idempotencyKey: `checkout_${bookingId}`,
        });

        return NextResponse.json({
            url: session.url,
            sessionId: session.id
        });
    } catch (error: any) {
        // Release this route's claim so the user can retry (M3). The
        // revert is predicated on the claim state: it releases only a
        // booking still in 'processing' — previously this update fired
        // by id alone, so an error thrown before/without a successful
        // claim (or after another path settled the fee) could force a
        // settled booking back to 'unpaid'.
        if (bookingId) {
            await supabase.from('bookings').update({ payment_status: 'unpaid' }).eq('id', bookingId).eq('payment_status', 'processing');
        }
        await logEvent({
            event_type: 'payment.booking_checkout.error',
            status: 'error',
            actor_type: 'system',
            message: error.message || 'Failed to create checkout session',
        });
        return NextResponse.json(
            { error: error.message || 'Failed to create payment session' },
            { status: 500 }
        );
    }
}
