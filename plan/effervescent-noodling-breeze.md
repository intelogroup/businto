# Security Audit — Businto Live App

## Context

Connected to live Supabase project `expwyvyphwlyhwrzdmmv` and audited all API routes, RLS policies, and DB functions. This plan documents confirmed vulnerabilities with severity levels and the exact fixes required. No speculation — every finding is verified against the live database or source code.

---

## Findings by Severity

### CRITICAL

#### C1 — `profiles` table: PII fully public to anonymous users
**Source:** RLS policy `"Public profiles are viewable"` — `USING (true)` for all roles including `anon`.
**Impact:** Any unauthenticated person can call `GET /rest/v1/profiles?select=*` and retrieve every user's `email`, `phone`, `full_name`, `role`, `company_name`. Complete user enumeration with PII.
**Fix:** Replace the blanket `USING (true)` with a scoped policy. Authenticated users see their own profile. Admins see all. Phone must never be in the public SELECT list.

**Migration:**
```sql
DROP POLICY "Public profiles are viewable" ON public.profiles;

CREATE POLICY "users_read_own_profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "admins_read_all_profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager')
  ));
```

---

#### C2 — `event_logs` table: RLS disabled, publicly readable
**Source:** Supabase advisor `rls_disabled_in_public` (ERROR). Confirmed via `pg_tables.rowsecurity = false`.
**Impact:** `event_logs` contains `actor_id`, `operator_id`, `request_id`, `user_id`, internal status messages, and metadata for every business event. Fully readable and writable via PostgREST without auth.

**Migration:**
```sql
ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_event_logs"
  ON public.event_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "admins_read_event_logs"
  ON public.event_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager')
  ));
```

---

#### C3 — `webhook_events` table: RLS disabled, publicly readable and writable
**Source:** Supabase advisor `rls_disabled_in_public` (ERROR).
**Impact:** Stripe webhook payloads (payment intent IDs, amounts, customer metadata) are fully readable and writable via PostgREST. Attackers could inject fake webhook events to trigger payment flows.

**Migration:**
```sql
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_webhook_events"
  ON public.webhook_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

---

#### C4 — `GET /api/quotes` — No authentication, exposes all operator contacts
**Source:** [src/app/api/quotes/route.ts:353-409](src/app/api/quotes/route.ts#L353)
**Impact:** Anyone can call `GET /api/quotes?request_id=<uuid>` and retrieve all quotes with operator `company_name`, `company_email`, `company_phone`, `rating`. No `requireUser()` check exists on the GET handler.

**Fix:** Add auth guard at the top of the GET handler, then scope results by user ownership (users see quotes on their own requests; operators see their own quotes only).

**File:** `src/app/api/quotes/route.ts`

---

#### C5 — `POST /api/quotes` — Unauthenticated operator_id fallback
**Source:** [src/app/api/quotes/route.ts:84](src/app/api/quotes/route.ts#L84)
**Code:** `const operator_id = tokenVerifiedOperatorId ?? validation.data.operator_id`
**Impact:** If no operator token is supplied, the body-supplied `operator_id` is trusted. Any actor can POST a quote impersonating any operator with no authentication.
**Fix:** If no token is present, reject the request with 403 unless the caller is an authenticated admin. Remove the unauthenticated body fallback.

---

#### C6 — Operators SELECT full `transport_requests` row including `metadata_private` and precise addresses
**Source:** RLS policy `"Operators see eligible requests"` — grants SELECT on the entire row to all verified operators.
**Impact:** `transport_requests` has `pickup_address`, `dropoff_address`, `pickup_lat/lng`, `metadata_private` (parent names, contact emails, medical info). Operators can read this directly via PostgREST before any quote is accepted, violating the CLAUDE.md PII mandate ("Private data must only leave the server via the finalized operator email template").
**Fix:** Apply column-level security — revoke sensitive columns from `authenticated` role, grant only safe columns:

**Migration:**
```sql
REVOKE SELECT (pickup_address, dropoff_address, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, metadata_private, metadata, payment_intent_id)
ON public.transport_requests FROM authenticated;
```
The API routes that need these columns already use `supabaseAdmin` (service role) and are unaffected.

---

#### C7 — Hardcoded JWT secret fallback in `src/lib/tokens.ts`
**Source:** [src/lib/tokens.ts:5](src/lib/tokens.ts#L5)
**Code:** `process.env.JWT_SECRET || 'your-secret-key-change-in-production'`
**Impact:** If `JWT_SECRET` is not set in the environment, all operator tokens and user trip tokens are signed with a publicly known default string. Anyone can forge a valid token to submit quotes as any operator or accept quotes as any user.
**Fix:**
```typescript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET env var is required — set it in your environment');
```

---

### HIGH

#### H1 — `GET /api/reviews` — No authentication
**Source:** [src/app/api/reviews/route.ts:97-154](src/app/api/reviews/route.ts#L97)
**Impact:** Anyone can enumerate all reviews for any operator or user. Includes `profiles(full_name)` join.
**Fix:** Add `requireUser()` OR, if public reviews are intentional, strip the profiles join for unauthenticated callers and add a filter requirement (must supply `operator_id` or `user_id` — no unbounded dumps).

---

#### H2 — `unified_profiles` view: SECURITY DEFINER bypasses RLS + messages API leaks phone numbers
**Source:** Supabase advisor `security_definer_view` (ERROR). Also [src/app/api/messages/route.ts:141-148](src/app/api/messages/route.ts#L141).
**Impact:**
1. The view runs with postgres permissions, bypassing caller RLS on underlying tables.
2. Messages API does `supabaseAdmin.from('unified_profiles').select('*')` and returns the full profile (including `phone`) to the client in the message response.

**Fix:**
1. Remove `SECURITY DEFINER` from the `unified_profiles` view DDL.
2. In the messages API, replace `select('*')` with `select('id, full_name, avatar_url, role')`.

---

#### H3 — `app_settings` and `email_claim_codes`: RLS enabled, zero policies (silent lockout)
**Source:** Supabase advisor `rls_enabled_no_policy` (INFO).
**Impact:** Any PostgREST access to these tables returns empty/errors for all roles. The app works only because `supabaseAdmin` bypasses RLS. But this masks bugs and creates a false security signal.
**Fix:** Add explicit policies so intent is documented and auditable:

```sql
-- app_settings: admin read, service_role full access
CREATE POLICY "service_role_app_settings" ON public.app_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admins_read_app_settings" ON public.app_settings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','manager')));

-- email_claim_codes: service_role only (never client-readable)
CREATE POLICY "service_role_claim_codes" ON public.email_claim_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
```

---

#### H4 — No HTTP security headers
**Source:** [next.config.ts](next.config.ts) — empty `nextConfig` object.
**Impact:** No CSP, no `X-Frame-Options` (clickjacking), no `X-Content-Type-Options`, no HSTS.

**Fix:** Add to `next.config.ts`:
```typescript
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    ],
  }];
}
```

---

### MEDIUM

#### M1 — 7 DB functions with mutable `search_path` (schema injection risk)
**Affected:** `find_operators_within_radius`, `calculate_distance`, `update_updated_at`, `update_operator_quote_count`, `process_operator_timeouts`, `handle_new_user`, `get_operator_stats`.
**Fix:** Add `SET search_path = public, pg_catalog` to each function definition via migration.

---

#### M2 — Duplicate and overly permissive INSERT policies on `transport_requests`
**Source:** 3 overlapping INSERT policies. `"Anyone can create requests"` has `WITH CHECK (true)` for all roles — authenticated users can insert with any `user_id`.
**Fix:** Drop `"Anyone can create requests"` and `"anon_insert_requests"`. Keep only `"users_insert_own_requests"` (authenticated, `WITH CHECK (auth.uid() = user_id)`). Add a clean anon policy that allows insert with `user_id = null` only.

---

#### M3 — Leaked password protection disabled
**Fix:** Enable in Supabase Dashboard → Auth → Password Security → Enable leaked password protection.

---

#### M4 — No rate limiting on any API route
**Impact:** Quote submissions, message sends, review POSTs are unbounded.
**Fix:** Add middleware rate limiting using `@upstash/ratelimit` with Vercel KV. Minimum: 10 req/min per IP on write endpoints.

---

#### M5 — `reviews` INSERT: no booking ownership check at DB level
**Impact:** Direct PostgREST calls bypass the API-level booking check.
**Fix:**
```sql
DROP POLICY "Users can create reviews" ON public.reviews;
CREATE POLICY "users_create_reviews_with_booking"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND b.user_id = auth.uid()
    )
  );
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/migrations/<timestamp>_security_hardening.sql` | C1, C2, C3, C6, H3, M1, M2, M5 |
| `src/app/api/quotes/route.ts` | C4: add `requireUser()` to GET; C5: remove body operator_id fallback |
| `src/app/api/reviews/route.ts` | H1: add `requireUser()` to GET |
| `src/app/api/messages/route.ts` | H2: replace `select('*')` with `select('id, full_name, avatar_url, role')` |
| `next.config.ts` | H4: add security headers |

---

## Verification

1. **PostgREST probe (C1):** `curl "https://expwyvyphwlyhwrzdmmv.supabase.co/rest/v1/profiles?select=*" -H "apikey: <anon_key>"` → must return `[]` or 403.
2. **PostgREST probe (C2/C3):** Same pattern for `event_logs` and `webhook_events` → must return empty.
3. **API auth probe (C4):** `curl -X GET "https://businto.com/api/quotes?request_id=<any-uuid>"` → must return 401.
4. **Column security (C6):** `SELECT pickup_address FROM transport_requests` as `authenticated` role → must return permission denied.
5. **Supabase advisors:** Re-run `get_advisors(type=security)` → zero ERROR items, zero WARN items for addressed issues.
6. **Security headers:** `curl -I https://businto.com` → must include `X-Frame-Options`, `Strict-Transport-Security`, `X-Content-Type-Options`.
7. **Existing tests:** `npm run test:production` must stay green throughout.

---

## Priority Order (implement in this sequence)

1. **C1** — profiles PII — live breach, fix first (5 min migration)
2. **C2 + C3** — RLS disabled tables — single migration, 10 min
3. **C4 + C5** — unauthenticated quotes API — 30 min code change
4. **H1** — unauthenticated reviews GET — 5 min code change
5. **H2** — SECURITY DEFINER view + messages phone leak — view DDL + 5 min code change
6. **C6** — operator address exposure — column privilege revocation (test carefully — API routes use service role and are safe)
7. **H3 + M2 + M5** — cleanup policies — single migration
8. **H4** — security headers — 15 min config change
9. **M1** — function search_path — migration
10. **M3** — enable leaked password protection — dashboard toggle
11. **M4** — rate limiting — separate sprint
