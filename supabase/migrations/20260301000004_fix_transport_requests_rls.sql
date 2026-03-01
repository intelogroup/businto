-- Fix RLS vulnerability where anonymous users could read unassigned requests
-- The test "CRITICAL: Anonymous users should NOT be able to SELECT transport_requests" failed because user_id IS NULL allowed public read.

-- Drop the insecure policies
DROP POLICY IF EXISTS "Users see own requests" ON public.transport_requests;
DROP POLICY IF EXISTS "Users can update own requests" ON public.transport_requests;
DROP POLICY IF EXISTS "Operators see eligible requests" ON public.transport_requests;

-- Recreate secure policies for authenticated users
CREATE POLICY "Users see own requests" 
ON public.transport_requests FOR SELECT TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own requests" 
ON public.transport_requests FOR UPDATE TO authenticated 
USING (auth.uid() = user_id);

-- Recreate Operator policy securely
CREATE POLICY "Operators see eligible requests" 
ON public.transport_requests FOR SELECT TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM operators o 
    WHERE o.profile_id = auth.uid() 
    AND (
      o.is_partner = true 
      OR transport_requests.priority_until IS NULL 
      OR transport_requests.priority_until <= now()
    )
  )
);
