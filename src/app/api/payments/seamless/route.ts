import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logEvent } from '@/lib/event-logger';
import { isTerminalBookingStatus, transition } from '@/lib/transitions';

const ROUTING_FEE_CENTS = 199; // $1.99

/**
 * Release a seamless payment claim (M3): revert 'processing' back to
 * 'unpaid' through a transition predicated on the claim state itself,
 * so a booking settled concurrently (the webhook landing 'paid' in the
 * window) is never overwritten by the release.
 */
async function releaseSeamlessClaim(bookingId: string) {
    await transition(supabase, {
        table: 'bookings',
        filters: [{ column: 'id', value: bookingId }],
        guardField: 'payment_status',
        from: ['processing'],
        patch: { payment_status: 'unpaid' },
    });
}

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
    // Set once this call holds the payment claim, so the outer catch
    // can release it (M3: no exit strands a booking in 'processing').
    let claimedBookingId: string | null = null;
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
                id, confirmation_code, request_id, amount, payment_status, status,
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

        // TERMINAL GUARD (BUS-PAYMENT-ON-CANCELLED-001, Phase 1 half):
        // a cancelled or completed booking must never be charged. The
        // CAS claim below only looks at payment_status (its discipline
        // is Phase 2); the booking lifecycle state was never checked.
        if (isTerminalBookingStatus(booking.status)) {
            return NextResponse.json(
                { error: `A ${booking.status} booking cannot be charged` },
                { status: 409 }
            );
        }

        // Atomic CAS: claim this booking for seamless payment by setting
        // payment_status to 'processing'. If checkout already claimed it,
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
            // mapped to success blind. Re-read, then answer:
            //   'paid'       → the fee settled via another path while
            //                  we raced it: the existing success answer.
            //   'processing' → another path holds the claim right now:
            //                  an in-progress answer, NOT success.
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
                return NextResponse.json({ status: 'success' });
            }
            if (freshStatus === 'processing') {
                return NextResponse.json(
                    { status: 'processing', error: 'payment_in_progress' },
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
        claimedBookingId = bookingId;

        const stripeCustomerId: string | null = (booking.user as any)?.stripe_customer_id ?? null;

        // ── 4. No saved card → fall back immediately ──────────────────────────
        if (!stripeCustomerId) {
            // CLAIM RELEASE (BUS-SEAMLESS-PROCESSING-STRAND-001, M3):
            // this exit holds the claim but charges nothing — release
            // it so the booking is not stranded in 'processing' and
            // the checkout fallback stays usable.
            await releaseSeamlessClaim(bookingId);
            return NextResponse.json({ status: 'requires_payment_method', error: 'no_saved_card' });
        }

        // ── 5. Fetch the most-recently-used saved PaymentMethod ───────────────
        const paymentMethods = await stripe.paymentMethods.list({
            customer: stripeCustomerId,
            type: 'card',
            limit: 10,
        });

        if (paymentMethods.data.length === 0) {
            // CLAIM RELEASE (BUS-SEAMLESS-PROCESSING-STRAND-001, M3):
            // same discipline as the no-saved-card exit above.
            await releaseSeamlessClaim(bookingId);
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
                // 3DS / SCA required — return clientSecret for inline modal.
                // The claim is HELD on this exit by design: a real
                // PaymentIntent is in flight and will settle through
                // the webhook, so the booking is not stranded.
                const clientSecret = stripeErr.raw?.payment_intent?.client_secret as string | undefined;
                if (clientSecret) {
                    return NextResponse.json({ status: 'requires_action', clientSecret });
                }
            }
            // Any other Stripe error (declined, insufficient funds, expired, etc.)
            // Release the claim (predicated on the claim state, so a
            // concurrently settled booking is never reverted) so the
            // checkout fallback can proceed.
            await releaseSeamlessClaim(bookingId);
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
                // COMMIT (M3): the write is predicated on this call's
                // claim state — commit only ever lands on a booking
                // still in 'processing' from this claim.
                await transition(supabase, {
                    table: 'bookings',
                    filters: [{ column: 'id', value: bookingId }],
                    guardField: 'payment_status',
                    from: ['processing'],
                    patch: { payment_status: 'paid' },
                });
                claimedBookingId = null;

                return NextResponse.json({ status: 'success' });

            case 'requires_action':
            case 'requires_confirmation':
                // The PaymentIntent is in flight (the client completes
                // it inline; the webhook settles it) — the claim is
                // held, not stranded.
                return NextResponse.json({
                    status: 'requires_action',
                    clientSecret: paymentIntent.client_secret,
                });

            default:
                // No charge is in flight for any other status (e.g.
                // 'requires_payment_method', 'canceled'): release the
                // claim so the booking is not stranded (M3).
                await releaseSeamlessClaim(bookingId);
                return NextResponse.json({
                    status: 'requires_payment_method',
                    error: paymentIntent.status,
                });
        }
    } catch (error: any) {
        // CLAIM RELEASE (M3): any unexpected throw after the claim —
        // e.g. listing payment methods or retrieving the customer —
        // releases it before the error answer, so no exit strands the
        // booking in 'processing'. The release is predicated on the
        // claim state; a booking this call never claimed is untouched.
        if (claimedBookingId) {
            try {
                await releaseSeamlessClaim(claimedBookingId);
            } catch {
                // Best effort — the original error is the one reported.
            }
        }
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
