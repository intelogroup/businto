#!/usr/bin/env node
/**
 * Apply email_claim_codes migration to production database
 * Uses service role key to execute SQL directly
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', !!serviceRoleKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('🚀 Applying email_claim_codes migration to production');
console.log('='.repeat(60));
console.log('');

// Read migration file
const migrationSQL = fs.readFileSync(
  'supabase/migrations/20260302100000_add_email_claim_codes.sql',
  'utf8'
);

console.log('📄 Migration SQL:');
console.log(migrationSQL.substring(0, 200) + '...');
console.log('');

try {
  console.log('⏳ Executing migration...');

  // Execute the SQL using rpc with a custom function, or break it into parts
  // Since Supabase doesn't have a direct SQL execution method, we'll use the REST API

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`
    },
    body: JSON.stringify({ query: migrationSQL })
  });

  if (!response.ok) {
    // RPC method might not exist, let's try using raw SQL
    // We'll create the table directly

    console.log('ℹ️  RPC method not available, executing via direct queries...');

    // Check if table exists
    const { data: tables, error: checkError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'email_claim_codes');

    if (checkError && !checkError.message.includes('does not exist')) {
      throw checkError;
    }

    if (tables && tables.length > 0) {
      console.log('✅ Table email_claim_codes already exists!');
      console.log('');

      // Verify structure
      const { data: columns } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type')
        .eq('table_name', 'email_claim_codes')
        .eq('table_schema', 'public');

      console.log('📋 Table structure:');
      columns?.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type}`);
      });

      process.exit(0);
    }

    // If we're here, table doesn't exist - need to execute SQL manually
    console.log('');
    console.log('⚠️  Cannot execute SQL programmatically with Supabase client.');
    console.log('');
    console.log('📋 Please apply migration manually:');
    console.log('');
    console.log('1. Open Supabase Dashboard:');
    console.log('   https://supabase.com/dashboard/project/expwyvyphwlyhwrzdmmv/sql/new');
    console.log('');
    console.log('2. Copy and paste this SQL:');
    console.log('   File: supabase/migrations/20260302100000_add_email_claim_codes.sql');
    console.log('');
    console.log('3. Click RUN');
    console.log('');
    process.exit(1);
  }

  const result = await response.json();
  console.log('✅ Migration applied successfully!');
  console.log('   Result:', result);

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  console.log('');
  console.log('📋 Manual application required:');
  console.log('   https://supabase.com/dashboard/project/expwyvyphwlyhwrzdmmv/sql/new');
  process.exit(1);
}
