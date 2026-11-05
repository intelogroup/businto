import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

/**
 * Create the $1.99 "Serious Lead Priority" Stripe Checkout session for a
 * transport request. This is the single source for the priority-fee session
 * shape: POST /api/requests calls it when a freshly created request is
 * pending payment and matched at least one operator. (The former standalone
 * POST /api/payments/checkout-session route duplicated this creation with
 * drifted copy and had no callers; it was removed 2026-11-05.)
 */
export async function createPriorityFeeCheckoutSession(opts: {
  requestId: string;
  appUrl: string;
}): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Serious Lead Priority',
            description: 'Notify partners immediately and get 30-minute priority.',
          },
          unit_amount: 199,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${opts.appUrl}/?request_id=${opts.requestId}&payment_success=true`,
    cancel_url: `${opts.appUrl}/?request_id=${opts.requestId}&payment_cancelled=true`,
    metadata: {
      request_id: opts.requestId,
      type: 'priority_fee',
    },
  });
}
