const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data: profiles, error: pErr } = await supabase.from('profiles').select('*');
    if (pErr) console.error(pErr);
    else console.log('PROFILES:', profiles.map(p => ({ id: p.id, email: p.email, role: p.role, company_name: p.company_name })));
}
run();
