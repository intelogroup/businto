const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSpecific() {
    const requestId = '51e48caa-3f51-4d32-bf10-808c0654d858';
    console.log(`🎟️ Checking claim codes for request ${requestId}...`);
    const { data: codes, error } = await supabase
        .from('email_claim_codes')
        .select('*')
        .eq('resource_id', requestId);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (codes.length === 0) {
        console.log('❌ No claim codes found for this request!');
    } else {
        codes.forEach(c => {
            console.log(`Code: ${c.code} | To: ${c.email_sent_to} | Created: ${c.created_at}`);
        });
    }
}

checkSpecific();
