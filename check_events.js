const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkEvents() {
    console.log('📜 Checking recent operator email events...');
    const { data: events, error } = await supabase
        .from('event_logs')
        .select('*')
        .eq('event_type', 'operator.request_email.sent')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error:', error);
        return;
    }

    events.forEach(e => {
        console.log(`[${e.created_at}] Sent to: ${e.metadata?.to} | Request: ${e.request_id} | MessageID: ${e.metadata?.message_id}`);
    });
}

checkEvents();
