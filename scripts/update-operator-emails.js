import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updateOperatorEmails() {
  console.log('Updating all operator emails to jimkalinov@gmail.com...\n');
  
  const { data, error } = await supabase
    .from('operators')
    .update({ company_email: 'jimkalinov@gmail.com' })
    .not('id', 'is', null)
    .select('id, company_name, company_email');
  
  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
  
  console.log(`✅ Updated ${data.length} operators:\n`);
  data.forEach(op => {
    console.log(`   ${op.company_name} → ${op.company_email}`);
  });
}

updateOperatorEmails();
