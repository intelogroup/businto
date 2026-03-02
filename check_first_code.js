const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function firstCode() {
    console.log('🕒 Checking the very first claim code in the database...');
    const { data: codes, error } = await supabase
        .from('email_claim_codes')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (codes.length === 0) {
        console.log('No codes found.');
    } else {
        console.log(`First code created at: ${codes[0].created_at}`);
    }
}

firstCode();
