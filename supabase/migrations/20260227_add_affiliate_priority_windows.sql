-- Add columns for affiliate priority window logic

ALTER TABLE public.transport_requests 
ADD COLUMN IF NOT EXISTS priority_window_ends_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS notified_standard_network boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS admin_alerted boolean DEFAULT false;
