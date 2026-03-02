const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
    console.log('🔍 Checking for email_claim_codes table...');
    const { data, error } = await supabase
        .from('email_claim_codes')
        .select('id')
        .limit(1);

    if (error) {
        console.error('❌ Error fetching from email_claim_codes:', error.message);
        if (error.code === 'PGRST205') {
            console.log('💡 Table not found or schema cache stale.');
        }
    } else {
        console.log('✅ Table exists! Found entries:', data.length);
    }

    console.log('\n🔍 Checking information_schema...');
    const { data: tables, error: tableErr } = await supabase.rpc('get_tables');

    if (tableErr) {
        // If rpc doesn't exist, try a raw query via a function if available, 
        // or just try to select from a known table.
        console.log('💡 rpc get_tables not found, trying raw SQL via PostgREST if allowed...');
    } else {
        console.log('Tables found:', tables);
    }
}

check();
