-- Backfill missing operator profiles for mock operators
DO $$
DECLARE
    op_record RECORD;
    new_profile_id UUID;
    clean_slug TEXT;
    unique_email TEXT;
BEGIN
    FOR op_record IN 
        SELECT id, company_name, company_email, company_phone 
        FROM public.operators 
        WHERE profile_id IS NULL
    LOOP
        -- Generate a URL-friendly slug from the company name
        clean_slug := lower(regexp_replace(op_record.company_name, '[^a-zA-Z0-9]+', '-', 'g'));
        -- Create a unique email for the profile (distinct from the company_email which is the brokerage hub)
        unique_email := 'staff+' || clean_slug || '@businto.com';

        -- Insert into operator_profiles
        INSERT INTO public.operator_profiles (
            full_name,
            email,
            phone,
            role,
            operator_id,
            avatar_url
        ) VALUES (
            op_record.company_name || ' Dispatch',
            unique_email,
            op_record.company_phone,
            'operator',
            op_record.id,
            'https://api.dicebear.com/7.x/identicon/svg?seed=' || clean_slug
        )
        RETURNING id INTO new_profile_id;

        -- Link back to operators table
        UPDATE public.operators 
        SET profile_id = new_profile_id 
        WHERE id = op_record.id;

        RAISE NOTICE 'Created profile % for company %', unique_email, op_record.company_name;
    END LOOP;
END $$;
