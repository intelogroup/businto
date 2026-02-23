#!/usr/bin/env node

/**
 * Run database migration using Supabase Management API
 * Usage: node scripts/run-migration-simple.js
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

// Read migration file
const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260110_create_operators.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

console.log('📄 Running migration: 20260110_create_operators.sql');
console.log('🔗 Supabase URL:', supabaseUrl);
console.log('');
console.log('⚠️  Note: This requires the Supabase service role key or direct database access.');
console.log('');
console.log('Please run this migration using one of these methods:');
console.log('');
console.log('Method 1: Supabase Dashboard');
console.log('  1. Go to https://supabase.com/dashboard/project/[your-project]/sql');
console.log('  2. Copy and paste the SQL from: supabase/migrations/20260110_create_operators.sql');
console.log('  3. Click "Run"');
console.log('');
console.log('Method 2: Supabase CLI (with Docker running)');
console.log('  1. Start Docker Desktop');
console.log('  2. Run: supabase db push');
console.log('');
console.log('Method 3: Direct psql connection');
console.log('  1. Get your database URL from Supabase dashboard');
console.log('  2. Run: psql [DATABASE_URL] -f supabase/migrations/20260110_create_operators.sql');
console.log('');

// Save a copy ready for dashboard
const copyPath = path.join(__dirname, '..', 'migration-ready-to-paste.sql');
fs.writeFileSync(copyPath, sql);
console.log(`✅ Migration SQL copied to: migration-ready-to-paste.sql`);
console.log('   You can open this file and copy its contents to the Supabase SQL Editor.');
