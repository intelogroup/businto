-- Fix RLS Leak in transport_requests
-- The previous "Users see own requests" policy allowed ANY caller (including anon) 
-- to see rows where user_id was NULL, which happens for all anonymous requests.

-- 1. Drop the leaky policy
DROP POLICY IF EXISTS "Users see own requests" ON public.transport_requests;

-- 2. Re-create it restricted to authenticated users matching their own ID
CREATE POLICY "Users see own requests_v2" 
    ON public.transport_requests 
    FOR SELECT 
    TO authenticated 
    USING (auth.uid() = user_id);

-- 3. Ensure operators still have their specific access (if any)
-- The hardening migration 20260228161308 already handled operator re-routing to API.

COMMENT ON POLICY "Users see own requests_v2" ON public.transport_requests IS 'Restricts SELECT access to the owner of the request only. Anonymous users cannot list requests.';
