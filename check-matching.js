// check-matching.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("=== LATEST 5 REQUESTS ===");
    const { data: requests, error: reqErr } = await supabase
        .from('transport_requests')
        .select('id, service_type, pickup_address, dropoff_address, pickup_lat, pickup_lng, metadata, metadata_safe, metadata_private')
        .order('created_at', { ascending: false })
        .limit(5);

    if (reqErr) {
        console.error("Error fetching requests:", reqErr);
        return;
    }

    requests.forEach(r => console.log(JSON.stringify(r, null, 2)));

    console.log("\n=== OPERATORS ===");
    const { data: operators, error: opErr } = await supabase
        .from('operators')
        .select('id, company_name, is_verified, is_active, is_accepting_requests, service_areas, vehicle_types, specialties, company_lat, company_lng')
        .limit(10);

    if (opErr) {
        console.error("Error fetching operators:", opErr);
        return;
    }

    operators.forEach(o => console.log(JSON.stringify(o, null, 2)));
}

main();
