-- Fix foreign key constraint on operator_access_log to reference operator_profiles instead of profiles

-- Drop existing FK constraint if it exists
ALTER TABLE public.operator_access_log 
  DROP CONSTRAINT IF EXISTS operator_access_log_operator_id_fkey;

-- Add the corrected FK constraint pointing to operator_profiles
ALTER TABLE public.operator_access_log 
  ADD CONSTRAINT operator_access_log_operator_id_fkey 
  FOREIGN KEY (operator_id) 
  REFERENCES public.operator_profiles(id) 
  ON DELETE SET NULL;
