import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function escalate() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        throw new Error("Missing Supabase URL or Service Key");
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const email = 'jimkalinov@gmail.com';
    
    console.log(`Escalating ${email} to admin...`);

    const { data, error } = await supabase
        .from('profiles')
        .update({ role: 'admin' })
        .eq('email', email)
        .select();

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Success! Updated profile:", data);
    }

    // Also reset password to ensure it's known
    console.log(`Resetting password for ${email}...`);
    const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
    const targetUser = userData?.users.find(u => u.email === email);
    
    if (targetUser) {
        const { error: updateError } = await supabase.auth.admin.updateUserById(
            targetUser.id,
            { password: 'password123' }
        );
        if (updateError) console.error("Password Update Error:", updateError);
        else console.log("Password reset to password123");
    } else {
        console.error("User not found in Auth");
    }
}

escalate();
