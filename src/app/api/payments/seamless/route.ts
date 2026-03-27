import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin as supabase } from '@/lib/supabase-server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logEvent } from '@/lib/event-logger';

const ROUTING_FEE_CENTS = 199; // $1.99

/**
 * POST /api/payments/seamless
 *
 * Attempts an off-session charge for a returning user who already has a saved card.
 *
 * Request body: { bookingId: string }
 *
 * Response union:
 *   { status: 'success' }
 *   { status: 'requires_action',        clientSecret: string }
 *   { status: 'requires_payment_method', error?: string }   — fall back to hosted checkout
 */
export async function POST(request: NextRequest) {
    try {
        // ── 1. Auth gate ──────────────────────────────────────────────────────
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
            // Not authenticated — caller should fall back to hosted checkout
            return NextResponse.json({ status: 'requires_payment_method', error: 'unauthenticated' });
        }

        // ── 2. Parse body ─────────────────────────────────────────────────────
        const { bookingId } = await request.json();

        if (!bookingId) {
            return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 });
        }

        // ── 3. Load booking + user profile ────────────────────────────────────
        const { data: booking, error: bookingError } = await supabase
            .from('bookings')
            .select(`
                id, confirmation_code, request_id, amount, payment_status,
                user:profiles!bookings_user_id_fkey (id, stripe_customer_id, email)
            `)
            .eq('id', bookingId)
            .eq('user_id', user.id) // ownership check
            .single();

        if (bookingError || !booking) {
            return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
        }

        if (booking.payment_status === 'paid') {
            // Already paid — treat as success so UI shows the green tick
            return NextResponse.json({ status: 'success' });
        }

        const stripeCustomerId: string | null = (booking.user as any)?.stripe_customer_id ?? null;

        // ── 4. No saved card → fall back immediately ──────────────────────────
        if (!stripeCustomerId) {
            return NextResponse.json({ status: 'requires_payment_method', error: 'no_saved_card' });
        }

        // ── 5. Fetch the most-recently-used saved PaymentMethod ───────────────
        const paymentMethods = await stripe.paymentMethods.list({
            customer: stripeCustomerId,
            type: 'card',
            limit: 10,
        });

        if (paymentMethods.data.length === 0) {
            return NextResponse.json({ status: 'requires_payment_method', error: 'no_payment_methods' });
        }

        // Prefer the default payment method set on the Customer, otherwise most-recent
        const customerObj = await stripe.customers.retrieve(stripeCustomerId) as import('stripe').Stripe.Customer;
        const defaultPmId = typeof customerObj.invoice_settings?.default_payment_method === 'string'
            ? customerObj.invoice_settings.default_payment_method
            : null;

        const paymentMethod = defaultPmId
            ? (paymentMethods.data.find(pm => pm.id === defaultPmId) ?? paymentMethods.data[0])
            : paymentMethods.data[0];

        // ── 6. Create + confirm off-session PaymentIntent ─────────────────────
        // IDEMPOTENCY: Use booking ID as idempotency key to prevent double-charging
        // if the client retries or both seamless + checkout fire concurrently (C3).
        let paymentIntent: import('stripe').Stripe.PaymentIntent;

        try {
            paymentIntent = await stripe.paymentIntents.create({
                amount: ROUTING_FEE_CENTS,
                currency: 'usd',
                customer: stripeCustomerId,
                payment_method: paymentMethod.id,
                off_session: true,
                confirm: true,
                description: `Platform Routing Fee — Booking ${booking.confirmation_code}`,
                metadata: {
                    booking_id: bookingId,
                    type: 'booking_routing_fee',
                    seamless: 'true',
                },
            }, {
                idempotencyKey: `seamless_${bookingId}_${paymentMethod.id}`,
            });
        } catch (stripeErr: any) {
            // Stripe throws for requires_action and card errors
            if (stripeErr.code === 'authentication_required') {
                // 3DS / SCA required — return clientSecret for inline modal
                const clientSecret = stripeErr.raw?.payment_intent?.client_secret as string | undefined;
                if (clientSecret) {
                    return NextResponse.json({ status: 'requires_action', clientSecret });
                }
            }
            // Any other Stripe error (declined, insufficient funds, expired, etc.)
            await logEvent({
                event_type: 'payment.seamless.stripe_error',
                status: 'error',
                actor_type: 'system',
                booking_id: bookingId,
                message: `${stripeErr.code}: ${stripeErr.message}`,
            });
            return NextResponse.json({
                status: 'requires_payment_method',
                error: stripeErr.code ?? 'stripe_error',
            });
        }

        // ── 7. Handle PaymentIntent statuses ──────────────────────────────────
        switch (paymentIntent.status) {
            case 'succeeded':
                // Webhook will fire payment_intent.succeeded and do the PII reveal.
                // Optimistically update payment_status here too so the UI is instant.
                await supabase
                    .from('bookings')
                    .update({ payment_status: 'paid' })
                    .eq('id', bookingId);

                return NextResponse.json({ status: 'success' });

            case 'requires_action':
            case 'requires_confirmation':
                return NextResponse.json({
                    status: 'requires_action',
                    clientSecret: paymentIntent.client_secret,
                });

            default:
                return NextResponse.json({
                    status: 'requires_payment_method',
                    error: paymentIntent.status,
                });
        }
    } catch (error: any) {
        await logEvent({
            event_type: 'payment.seamless.error',
            status: 'error',
            actor_type: 'system',
            message: error.message || 'Unexpected seamless payment error',
        });
        return NextResponse.json(
            { error: error.message || 'Unexpected error' },
            { status: 500 }
        );
    }
}
