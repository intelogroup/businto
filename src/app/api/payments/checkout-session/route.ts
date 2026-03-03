import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin as supabase } from '@/lib/supabase-server';
import { getAppBaseUrl } from '@/lib/email';

export async function POST(request: NextRequest) {
    try {
        const { requestId } = await request.json();

        if (!requestId) {
            return NextResponse.json(
                { error: 'Missing requestId' },
                { status: 400 }
            );
        }

        // Get request details
        const { data: transportRequest, error: requestError } = await supabase
            .from('transport_requests')
            .select(`
        *,
        user:profiles!transport_requests_user_id_fkey (email, full_name)
      `)
            .eq('id', requestId)
            .single();

        if (requestError || !transportRequest) {
            return NextResponse.json({ error: 'Transport request not found' }, { status: 404 });
        }

        const appUrl = getAppBaseUrl();

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'Serious Lead Verification & Priority Matching',
                            description: 'Notify partners immediately and get priority matching for 30 minutes.',
                        },
                        unit_amount: 199, // $1.99
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${appUrl}/?request_id=${requestId}&payment_success=true`,
            cancel_url: `${appUrl}/?request_id=${requestId}&payment_cancelled=true`,
            customer_email: transportRequest.user?.email,
            metadata: {
                request_id: requestId,
                type: 'priority_fee'
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
