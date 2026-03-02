-- Email Claim Codes: Short-lived codes for secure email link authentication
-- Prevents email tracking services from breaking long JWT tokens in URLs

CREATE TABLE IF NOT EXISTS public.email_claim_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Short alphanumeric code (e.g., "ABC123XYZ")
  code TEXT UNIQUE NOT NULL,
  
  -- What this code grants access to
  resource_type TEXT NOT NULL, -- 'operator_quote', 'trip_view', 'password_reset'
  resource_id UUID NOT NULL,   -- Request ID, Trip ID, User ID, etc.
  
  -- Authorization context
  operator_id UUID,            -- If this is for an operator
  user_id UUID,                -- If this is for a user
  purpose TEXT NOT NULL,       -- 'quote', 'view', 'reset_password'
  
  -- Security
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,         -- Null = not used yet
  used_from_ip TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  email_sent_to TEXT           -- Track which email received this code
);

-- Index for fast lookup by code
CREATE INDEX idx_email_claim_codes_code ON public.email_claim_codes(code) 
WHERE used_at IS NULL;

-- Auto-delete expired codes after 30 days
CREATE INDEX idx_email_claim_codes_expires ON public.email_claim_codes(expires_at);

-- RLS: Codes are redeemed server-side only, no direct client access
ALTER TABLE public.email_claim_codes ENABLE ROW LEVEL SECURITY;

-- No policies needed - server-side only access via service role

COMMENT ON TABLE public.email_claim_codes IS 
'Short-lived claim codes for email links. Prevents tracking services from breaking auth tokens.';
