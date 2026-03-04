-- Add stripe_customer_id to profiles for saved payment method (1-click checkout)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

COMMENT ON COLUMN public.profiles.stripe_customer_id IS
  'Stripe Customer ID used for off-session (saved card) payments. Populated on first successful checkout.';
