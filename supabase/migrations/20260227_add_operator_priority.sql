-- Add partnership and prioritization logic to the system

-- 1. Add partner status to operators
ALTER TABLE public.operators 
ADD COLUMN is_partner BOOLEAN DEFAULT FALSE;

-- 2. Add payment and prioritization fields to transport requests
ALTER TABLE public.transport_requests 
ADD COLUMN payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'authorized', 'paid', 'failed')),
ADD COLUMN payment_intent_id TEXT,
ADD COLUMN priority_until TIMESTAMPTZ,
ADD COLUMN routing_fee_amount DECIMAL(10,2) DEFAULT 1.99;

-- Add comments for clarity
COMMENT ON COLUMN public.operators.is_partner IS 'Whether the operator is a platform partner and receives 30-minute early access to requests.';
COMMENT ON COLUMN public.transport_requests.priority_until IS 'The timestamp until which only partner operators can see and respond to this request.';
COMMENT ON COLUMN public.transport_requests.payment_status IS 'Whether the user has paid the $1.99 serious lead fee.';

-- Index for searching priority requests
CREATE INDEX idx_requests_priority ON public.transport_requests(priority_until);
CREATE INDEX idx_operators_partner ON public.operators(is_partner);

-- Update RLS for priority logic
-- Non-partners should only see requests where priority_until is null or in the past
DROP POLICY IF EXISTS "Operators see pending requests" ON public.transport_requests;

CREATE POLICY "Operators see eligible requests" ON public.transport_requests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.operators o 
            WHERE o.profile_id = auth.uid() 
            AND (
                o.is_partner = TRUE OR 
                transport_requests.priority_until IS NULL OR 
                transport_requests.priority_until <= NOW()
            )
        )
    );
