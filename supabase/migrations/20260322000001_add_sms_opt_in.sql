-- Add SMS opt-in flag to profiles table.
-- Users must explicitly opt in to receive SMS notifications for critical trip events
-- (quote received, trip accepted, 30-min ETA). Default is false.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.sms_opt_in IS
  'User has opted in to receive Brevo transactional SMS for critical trip events. Requires a valid phone number to be effective.';
