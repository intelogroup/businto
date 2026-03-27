import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin as supabase } from '@/lib/supabase-server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAppBaseUrl } from '@/lib/email';
import { logEvent } from '@/lib/event-logger';

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
            // Another payment path is already in-flight or completed
            const appUrl = getAppBaseUrl();
            return NextResponse.json({
                url: `${appUrl}/trips/${booking.request_id}?payment=success`,
                alreadyPaid: true,
            });
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
        // Revert processing lock so the user can retry
        if (bookingId) {
            await supabase.from('bookings').update({ payment_status: 'unpaid' }).eq('id', bookingId);
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
