const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testQuery() {
  const service_type = 'medical';
  const specialty = 'Medical Transport';
  const state = 'MA';

  console.log(`🔍 Testing query for service_type: ${service_type}, specialty: ${specialty}, state: ${state}`);

  let query = supabase
    .from('operators')
    .select(`company_name, specialties, service_areas`)
    .eq('is_verified', true)
    .eq('is_active', true)
    .eq('is_accepting_requests', true);

  if (state) {
    query = query.contains('service_areas', [state]);
  }

  if (specialty) {
    query = query.contains('specialties', [specialty]);
  }

  const { data, error } = await query;

  if (error) {
    console.error('❌ Query error:', error);
    return;
  }

  console.log(`✅ Query returned ${data.length} operators:`, data.map(o => o.company_name));
}

testQuery().catch(console.error);
