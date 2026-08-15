-- SECURITY: "Operators see eligible requests" (20260301000004_fix_transport_requests_rls.sql)
-- grants full-row SELECT — including metadata_private and exact pickup/dropoff addresses —
-- to ANY operator once the affiliate priority window lapses, with no match/distance/
-- specialty check. Combined with client pages that query transport_requests directly
-- (trips/[id], trips/page, trips/view), any logged-in operator could open
-- /trips/<any-request-id> and read a customer's PII before ever submitting a quote.
--
-- This re-establishes the architectural intent already documented on this table by
-- 20260228161308_harden_operator_profiles_rls.sql: "Access to transport_requests data
-- for operators must go through authorized API routes (/api/requests/[id]/operator-view)
-- which verify JWT tokens and sanitize fields." No operator-facing code path reads this
-- table directly via the client — /api/operator/pending-requests and the operator-view
-- route both use the service-role client, which is unaffected by RLS.

DROP POLICY IF EXISTS "Operators see eligible requests" ON public.transport_requests;

COMMENT ON TABLE public.transport_requests IS 'Transport requests data. Direct SELECT access for operators is disabled; operators must read via authorized, field-sanitizing API endpoints (/api/requests/[id]/operator-view, /api/operator/pending-requests).';
