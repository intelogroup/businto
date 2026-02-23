#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('🔍 Testing Supabase connection...');
  console.log('📍 URL:', supabaseUrl);
  console.log('');

  try {
    // Try to query profiles table
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);

    if (!profileError) {
      console.log('✅ Connected! profiles table exists');
    } else {
      console.log('⚠️  profiles table not found:', profileError.message);
    }

    // Try to query operators table
    const { data: operators, error: operatorError } = await supabase
      .from('operators')
      .select('count')
      .limit(1);

    if (!operatorError) {
      console.log('✅ operators table exists');
      
      const { data: opData, count } = await supabase
        .from('operators')
        .select('*', { count: 'exact' });
      
      console.log(`📊 Found ${count || 0} operators in database`);
    } else {
      console.log('❌ operators table not found:', operatorError.message);
      console.log('');
      console.log('📝 You need to run the migration first!');
      console.log('   Go to: https://supabase.com/dashboard/project/vbjdzadbrlszuulkpvwq/sql');
      console.log('   Copy the contents of: supabase/migrations/20260110_create_operators.sql');
      console.log('   Paste and click "Run"');
    }

    // Check transport_requests table
    const { data: requests, error: requestError } = await supabase
      .from('transport_requests')
      .select('count')
      .limit(1);

    if (!requestError) {
      console.log('✅ transport_requests table exists');
    } else {
      console.log('⚠️  transport_requests table not found');
    }

  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
}

testConnection();
