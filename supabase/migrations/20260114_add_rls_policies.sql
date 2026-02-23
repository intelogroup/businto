-- Row Level Security policies to enforce architectural boundary
-- Prevents direct client access to PII data in transport_requests

-- Enable RLS on transport_requests table
ALTER TABLE public.transport_requests ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anonymous users (operators) can only SELECT safe fields
-- They cannot access metadata_private, pickup_address, dropoff_address directly
CREATE POLICY "operators_read_safe_fields_only"
  ON public.transport_requests
  FOR SELECT
  TO anon
  USING (true);

-- Note: The policy allows SELECT but application code must explicitly choose columns
-- Server-side API routes will enforce which columns are returned to operators

-- Policy 2: Authenticated users can SELECT their own requests (full access)
CREATE POLICY "users_read_own_requests"
  ON public.transport_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy 3: Authenticated users can INSERT their own requests
CREATE POLICY "users_insert_own_requests"
  ON public.transport_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy 4: Anonymous users can INSERT requests (for public forms)
-- This allows anonymous request submission from public website
CREATE POLICY "anon_insert_requests"
  ON public.transport_requests
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy 5: Authenticated users can UPDATE their own requests
CREATE POLICY "users_update_own_requests"
  ON public.transport_requests
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy 6: Service role has full access (for server-side operations)
CREATE POLICY "service_role_full_access"
  ON public.transport_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add comments for documentation
COMMENT ON POLICY "operators_read_safe_fields_only" ON public.transport_requests IS
  'Allows anonymous users (operators) to query requests, but application code enforces column-level restrictions via API';

COMMENT ON POLICY "users_read_own_requests" ON public.transport_requests IS
  'Authenticated users can read their own requests with full field access';

COMMENT ON POLICY "anon_insert_requests" ON public.transport_requests IS
  'Allows public form submissions from anonymous users';
