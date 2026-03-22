import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin as supabase } from '@/lib/supabase-server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAppBaseUrl } from '@/lib/email';
import { logEvent } from '@/lib/event-logger';

export async function POST(request: NextRequest) {
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

        const { requestId } = await request.json();

        if (!requestId) {
            return NextResponse.json(
                { error: 'Missing requestId' },
                { status: 400 }
            );
        }

        // Get request details (ownership check: user must own the request)
        const { data: transportRequest, error: requestError } = await supabase
            .from('transport_requests')
            .select(`
        *,
        user:profiles!transport_requests_user_id_fkey (email, full_name)
      `)
            .eq('id', requestId)
            .eq('user_id', user.id)
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
        await logEvent({
            event_type: 'payment.checkout_session.error',
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
