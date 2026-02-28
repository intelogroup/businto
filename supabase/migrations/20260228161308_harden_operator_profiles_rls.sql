-- Hardening RLS Policies for transport_requests
-- Drop overly broad policy and replace with specific authorized access

-- 1. Drop existing permissive policies
DROP POLICY IF EXISTS "operators_read_safe_fields_only" ON public.transport_requests;
DROP POLICY IF EXISTS "anon_insert_requests" ON public.transport_requests;

-- 2. Policy for anonymous users to INSERT requests (for public forms)
-- This is necessary for public users submitting a request before signing up
CREATE POLICY "anon_insert_requests_v2"
  ON public.transport_requests
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- 3. Anonymous SELECT access is now DISABLED by default
-- Access to transport_requests data for operators must go through 
-- authorized API routes (/api/requests/[id]/operator-view) 
-- which verify JWT tokens and sanitize fields.

-- 4. Ensure Authenticated users can still only see their own requests
-- (Policy 2 and 3 from original migration should remain, but let's re-verify)
-- CREATE POLICY "users_read_own_requests" ...

COMMENT ON TABLE public.transport_requests IS 'Transport requests data. Direct anonymous SELECT access is disabled for security; use authorized API endpoints.';
