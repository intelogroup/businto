-- 20260302000000_fix_unified_profiles.sql
-- Fixes the "Split Identity" deadlock where users/operators appear twice in the view.
-- Uses a JOIN to prioritize operator data if it exists for a given ID.

DROP VIEW IF EXISTS public.unified_profiles;

CREATE OR REPLACE VIEW public.unified_profiles AS
SELECT 
  COALESCE(op.id, p.id) as id, 
  COALESCE(op.full_name, p.full_name) as full_name, 
  COALESCE(op.avatar_url, p.avatar_url) as avatar_url, 
  COALESCE(op.role, p.role) as role, 
  COALESCE(op.email, p.email) as email, 
  COALESCE(op.phone, p.phone) as phone, 
  CASE WHEN op.id IS NOT NULL THEN 'operator' ELSE 'user' END as profile_type, 
  op.operator_id 
FROM public.profiles p
FULL OUTER JOIN public.operator_profiles op ON p.id = op.id;
