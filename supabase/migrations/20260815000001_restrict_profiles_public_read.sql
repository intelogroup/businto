-- SECURITY: "Public profiles are viewable" (20260104_complete_schema.sql:234) had no
-- TO clause, so it applied to the `anon` role as well as `authenticated`. Since the
-- Supabase anon key is embedded in client-side JS by design, this made every user's
-- full_name/email/phone in `profiles` readable by anyone, no login required.
--
-- No client code depends on reading other users' profiles directly (server routes use
-- the service-role client and bypass RLS entirely; the one client-side join against
-- `profiles` in trips/[id]/page.tsx is already scoped to the caller's own row).

DROP POLICY IF EXISTS "Public profiles are viewable" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);
