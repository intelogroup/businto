ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS requires_manual_exchange BOOLEAN DEFAULT FALSE;
