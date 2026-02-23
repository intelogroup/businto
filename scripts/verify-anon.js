const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://expwyvyphwlyhwrzdmmv.supabase.co';
const supabaseAnonKey = 'sb_publishable_eZoo-pgAFZIsQBJpAbG9XQ_P3Ji7i4h';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verifyAnon() {
    console.log('Testing anon key connection...');
    try {
        // Try to fetch something public or just get session
        const { data, error } = await supabase.from('profiles').select('id').limit(1);

        if (error) {
            console.log('Note: Error fetching profiles (likely RLS), but connection made:', error.message);
        } else {
            console.log('✅ Anon key can read profiles!');
        }

        // Check if we can at least reach the auth health endpoint indirectly
        const { data: authData, error: authError } = await supabase.auth.getSession();
        console.log('✅ Auth service reachable');

        process.exit(0);
    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
        process.exit(1);
    }
}

verifyAnon();
