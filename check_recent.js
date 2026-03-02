const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRecent() {
    console.log('🕒 Checking most recent transport requests...');
    const { data: requests, error } = await supabase
        .from('transport_requests')
        .select('id, created_at, status')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error:', error);
        return;
    }

    requests.forEach(r => {
        console.log(`Request ${r.id} created at ${r.created_at} (${r.status})`);
    });

    console.log('\n🎟️ Checking most recent email claim codes...');
    const { data: codes, error: codeErr } = await supabase
        .from('email_claim_codes')
        .select('code, resource_id, created_at, email_sent_to')
        .order('created_at', { ascending: false })
        .limit(5);

    if (codeErr) {
        console.error('Error:', codeErr);
        return;
    }

    codes.forEach(c => {
        console.log(`Code ${c.code} for ${c.resource_id} sent to ${c.email_sent_to} at ${c.created_at}`);
    });
}

checkRecent();
