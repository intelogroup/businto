import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin as supabase } from '@/lib/supabase-server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAppBaseUrl } from '@/lib/email';

const ROUTING_FEE = 1.99;

export async function POST(request: NextRequest) {
    try {
        const { bookingId } = await request.json();

        if (!bookingId) {
            return NextResponse.json(
                { error: 'Missing bookingId' },
                { status: 400 }
            );
        }

        // Get booking details (including user's stripe_customer_id)
        const { data: booking, error: bookingError } = await supabase
            .from('bookings')
            .select(`
        *,
        user:profiles!bookings_user_id_fkey (id, email, full_name, stripe_customer_id),
        operator:profiles!bookings_operator_id_fkey (company_name)
      `)
            .eq('id', bookingId)
            .single();

        if (bookingError || !booking) {
            return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
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
        });

        return NextResponse.json({
            url: session.url,
            sessionId: session.id
        });
    } catch (error: any) {
        console.error('Error creating checkout session:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to create payment session' },
            { status: 500 }
        );
    }
}
