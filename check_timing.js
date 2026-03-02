const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTiming() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    console.log('🕒 Checking operator email events in the last 24h...');
    const { data: events, error } = await supabase
        .from('event_logs')
        .select('*')
        .eq('event_type', 'operator.request_email.sent')
        .gte('created_at', yesterday.toISOString())
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${events.length} events.`);

    // Group by hour or just show a few from different periods
    events.slice(0, 20).forEach(e => {
        console.log(`[${e.created_at}] To: ${e.metadata?.to} | Request: ${e.request_id}`);
    });
}

checkTiming();
