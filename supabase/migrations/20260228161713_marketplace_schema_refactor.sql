-- 1. Create the operator_profiles table
CREATE TABLE IF NOT EXISTS public.operator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'operator' CHECK (role = 'operator'),
  operator_id UUID REFERENCES public.operators(id) ON DELETE CASCADE
);

-- 2. Link profile_id in operators back to the new table
ALTER TABLE public.operators DROP CONSTRAINT IF EXISTS operators_profile_id_fkey;
ALTER TABLE public.operators 
ADD CONSTRAINT operators_profile_id_fkey 
FOREIGN KEY (profile_id) REFERENCES public.operator_profiles(id) ON DELETE SET NULL;

-- 3. Refactor Quotes table
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_operator_id_fkey;
ALTER TABLE public.quotes 
ADD CONSTRAINT quotes_operator_id_fkey 
FOREIGN KEY (operator_id) REFERENCES public.operators(id) ON DELETE CASCADE;

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. Refactor Bookings table
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_operator_id_fkey;
ALTER TABLE public.bookings 
ADD CONSTRAINT bookings_operator_id_fkey 
FOREIGN KEY (operator_id) REFERENCES public.operators(id) ON DELETE SET NULL;

-- 5. Create Unified Profiles View
CREATE OR REPLACE VIEW public.unified_profiles AS
SELECT 
  id, 
  full_name, 
  avatar_url, 
  role, 
  email, 
  phone, 
  'user' as profile_type, 
  NULL::uuid as operator_id 
FROM public.profiles
UNION ALL
SELECT 
  id, 
  full_name, 
  avatar_url, 
  role, 
  email, 
  phone, 
  'operator' as profile_type, 
  operator_id 
FROM public.operator_profiles;

-- 6. Hardened RLS Policies
ALTER TABLE public.operator_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own operator profile" ON public.operator_profiles;
CREATE POLICY "Users can view own operator profile"
ON public.operator_profiles FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own operator profile" ON public.operator_profiles;
CREATE POLICY "Users can update own operator profile"
ON public.operator_profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Operators see own quotes" ON public.quotes;
CREATE POLICY "Operators see own quotes"
ON public.quotes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.operator_profiles
    WHERE id = auth.uid() AND operator_id = quotes.operator_id
  )
);

DROP POLICY IF EXISTS "Users see own bookings" ON public.bookings;
CREATE POLICY "Users see own bookings"
ON public.bookings FOR SELECT TO authenticated
USING (
  user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.operator_profiles
    WHERE id = auth.uid() AND operator_id = bookings.operator_id
  )
);
