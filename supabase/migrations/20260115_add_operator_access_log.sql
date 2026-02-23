-- Migration: Add Operator Access Audit Logging
-- Purpose: Track all operator-view API accesses for compliance and abuse detection
-- Date: 2026-01-11

-- Create operator_access_log table
DROP TABLE IF EXISTS operator_access_log CASCADE;
CREATE TABLE operator_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES transport_requests(id) ON DELETE CASCADE,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  operator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  token_purpose TEXT CHECK (token_purpose IN ('view', 'quote'))
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_operator_access_log_request_id ON operator_access_log(request_id);
CREATE INDEX IF NOT EXISTS idx_operator_access_log_operator_id ON operator_access_log(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_access_log_accessed_at ON operator_access_log(accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_operator_access_log_ip_address ON operator_access_log(ip_address);

-- Add RLS policies
ALTER TABLE operator_access_log ENABLE ROW LEVEL SECURITY;

-- Policy: Service role has full access
CREATE POLICY service_role_full_access_operator_access_log
  ON operator_access_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Authenticated users can view their own access logs
CREATE POLICY users_view_own_access_logs
  ON operator_access_log
  FOR SELECT
  TO authenticated
  USING (
    operator_id = auth.uid()
    OR
    request_id IN (
      SELECT id FROM transport_requests WHERE user_id = auth.uid()
    )
  );

-- Add comments
COMMENT ON TABLE operator_access_log IS 'Audit log for operator-view API accesses';
COMMENT ON COLUMN operator_access_log.request_id IS 'Transport request that was accessed';
COMMENT ON COLUMN operator_access_log.accessed_at IS 'When the access occurred';
COMMENT ON COLUMN operator_access_log.ip_address IS 'IP address of the accessor';
COMMENT ON COLUMN operator_access_log.user_agent IS 'Browser user agent string';
COMMENT ON COLUMN operator_access_log.operator_id IS 'Operator who accessed (if known)';
COMMENT ON COLUMN operator_access_log.quote_id IS 'Related quote (if applicable)';
COMMENT ON COLUMN operator_access_log.token_purpose IS 'Purpose from the access token (view or quote)';
