import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkOperators() {
  console.log('🔍 Checking operators in database...\n');
  
  const { data, error } = await supabase
    .from('operators')
    .select('id, company_name, company_email, service_areas, vehicle_types')
    .limit(5);
  
  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
  
  if (!data || data.length === 0) {
    console.log('❌ No operators found in database!');
    console.log('   Run the seed script first to create operators.');
    process.exit(1);
  }
  
  console.log(`✅ Found ${data.length} operators:\n`);
  data.forEach(op => {
    console.log(`   ${op.company_name}`);
    console.log(`   Email: ${op.company_email}`);
    console.log(`   Areas: ${op.service_areas?.join(', ') || 'None'}`);
    console.log(`   Vehicles: ${op.vehicle_types?.join(', ') || 'None'}`);
    console.log('');
  });
}

checkOperators();
