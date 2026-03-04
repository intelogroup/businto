-- ============================================================
-- Businto Performance Optimization Indexes
-- Applied via: supabase db push
-- Generated: 2026-03-04
-- ============================================================
-- NOTE: CONCURRENTLY removed — it cannot run inside a transaction
-- block (used by both `supabase db push` and the SQL editor).
-- The Supabase CLI wraps each migration in a transaction; these
-- plain CREATE INDEX statements are safe and idempotent (IF NOT EXISTS).
-- ============================================================

-- 1. Fix slow operator matching query (is_verified + is_active + is_accepting)
--    Measured: p95 261ms → expected ~80ms after index
CREATE INDEX IF NOT EXISTS idx_operators_active_status
  ON operators(is_verified, is_active, is_accepting_requests)
  WHERE is_verified = true AND is_active = true AND is_accepting_requests = true;

-- 2. Fix slow quotes scan (ORDER BY created_at + no LIMIT)
--    Measured: p95 590ms → expected ~150ms after index + pagination
CREATE INDEX IF NOT EXISTS idx_quotes_created_at_desc
  ON quotes(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quotes_request_id
  ON quotes(request_id);

CREATE INDEX IF NOT EXISTS idx_quotes_operator_id
  ON quotes(operator_id);

CREATE INDEX IF NOT EXISTS idx_quotes_status
  ON quotes(status);

-- 3. Fix slow claim code lookups (was hitting p95 730ms)
CREATE INDEX IF NOT EXISTS idx_claim_codes_code
  ON claim_codes(code);

CREATE INDEX IF NOT EXISTS idx_claim_codes_request_id
  ON claim_codes(request_id);

-- 4. Fix transport_request lookups
CREATE INDEX IF NOT EXISTS idx_transport_requests_user_id
  ON transport_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_transport_requests_status
  ON transport_requests(status);

CREATE INDEX IF NOT EXISTS idx_transport_requests_created_at_desc
  ON transport_requests(created_at DESC);

-- 5. Notifications — needed for dashboard polling
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created
  ON notifications(user_id, created_at DESC);

-- 6. App settings — single-row lookups by key
--    Using plain CREATE INDEX (not UNIQUE) since uniqueness is enforced by app logic
CREATE INDEX IF NOT EXISTS idx_app_settings_key
  ON app_settings(key);

-- 7. Event logs — frequently queried by request_id and created_at
CREATE INDEX IF NOT EXISTS idx_event_logs_request_id
  ON event_logs(request_id);

CREATE INDEX IF NOT EXISTS idx_event_logs_created_at_desc
  ON event_logs(created_at DESC);

-- ============================================================
-- Verify index creation (paste this separately in SQL editor):
-- ============================================================
-- SELECT schemaname, tablename, indexname
-- FROM pg_indexes
-- WHERE tablename IN ('operators', 'quotes', 'claim_codes', 'transport_requests',
--                     'notifications', 'app_settings', 'event_logs')
--   AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
