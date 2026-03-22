import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    if (!_stripe) {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        throw new Error('STRIPE_SECRET_KEY environment variable is not set');
      }
      _stripe = new Stripe(stripeSecretKey, {
        apiVersion: '2025-12-15.clover' as Stripe.LatestApiVersion,
      });
    }
    return (_stripe as any)[prop];
  },
});

export const getStripePublishableKey = () => {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
};
