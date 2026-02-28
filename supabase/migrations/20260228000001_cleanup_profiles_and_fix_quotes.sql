-- Drop operator-specific fields from profiles
ALTER TABLE public.profiles
DROP COLUMN IF EXISTS company_name,
DROP COLUMN IF EXISTS is_verified,
DROP COLUMN IF EXISTS cori_verified,
DROP COLUMN IF EXISTS insurance_verified;

-- Update quotes to reference operators instead of profiles
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_operator_id_fkey;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.operators(id) ON DELETE CASCADE;
