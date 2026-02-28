import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin as supabase } from '@/lib/supabase-server';
import Stripe from 'stripe';

export async function POST(request: NextRequest) {
    const payload = await request.text();
    const sig = request.headers.get('stripe-signature');

    let event: Stripe.Event;

    try {
        if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
            throw new Error('Missing stripe-signature or webhook secret');
        }
        event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.metadata?.type === 'priority_fee' && session.metadata?.request_id) {
            const requestId = session.metadata.request_id;

            // Update the transport request
            const { error } = await supabase
                .from('transport_requests')
                .update({
                    payment_status: 'paid',
                    payment_intent_id: session.payment_intent as string,
                    priority_until: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                    routing_fee_amount: 1.99
                })
                .eq('id', requestId);

            if (error) {
                console.error('Failed to update transport request after payment:', error);
            } else {
                console.log(`✓ Updated transport request ${requestId} to PAID status with 30-min priority.`);
            }
        }
    }

    return NextResponse.json({ received: true });
}
