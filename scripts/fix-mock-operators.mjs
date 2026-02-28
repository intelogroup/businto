import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixOperators() {
    const { data: operators, error } = await supabaseAdmin
        .from('operators')
        .select('*')
        .is('profile_id', null);

    if (error) {
        console.error(error);
        return;
    }

    console.log(`Found ${operators.length} operators without profiles.`);

    for (const op of operators) {
        console.log(`Creating auth user for ${op.company_name}...`);
        // Create auth user
        const email = `mock-${op.id}@businto.com`; // ensure uniqueness
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: 'MockUser123!',
            email_confirm: true,
            user_metadata: {
                full_name: op.company_name,
            }
        });

        if (authError) {
            console.error(`Failed to create user for ${op.company_name}:`, authError);
            continue;
        }

        const profileId = authData.user.id;

        // profile is auto-created by the trigger! So we just need to wait a sec and update its role to 'operator'
        await new Promise(r => setTimeout(r, 1000));

        await supabaseAdmin
            .from('profiles')
            .update({
                role: 'operator',
                company_name: op.company_name,
                company_email: op.company_email,
                company_phone: op.company_phone,
            })
            .eq('id', profileId);

        // Link operator to the profile
        const { error: opUpdateError } = await supabaseAdmin
            .from('operators')
            .update({ profile_id: profileId })
            .eq('id', op.id);

        if (opUpdateError) {
            console.error(`Failed to update operator ${op.company_name} with profile id:`, opUpdateError);
        } else {
            console.log(`✅ Set profile_id ${profileId} for ${op.company_name}`);
        }
    }
}

fixOperators().then(() => console.log('Done'));
