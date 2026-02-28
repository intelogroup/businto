import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        throw new Error("Missing Supabase URL or Service Key");
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    console.log("=== RECENT USERS ===");
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) console.error("User Error:", userError);
    else {
        const recentUsers = users.users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);
        console.log(JSON.stringify(recentUsers, null, 2));
    }

    console.log("\n=== RECENT PROFILES ===");
    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (profileError) console.error("Profile Error:", profileError);
    else console.log(JSON.stringify(profiles, null, 2));
}

run();
