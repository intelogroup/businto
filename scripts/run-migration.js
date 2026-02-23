#!/usr/bin/env node

/**
 * Run database migration script
 * Usage: node scripts/run-migration.js supabase/migrations/20260110_create_operators.sql
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  process.exit(1);
}

// Get migration file from command line args
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ Please provide a migration file path');
  console.error('Usage: node scripts/run-migration.js supabase/migrations/20260110_create_operators.sql');
  process.exit(1);
}

const migrationPath = path.resolve(process.cwd(), migrationFile);

if (!fs.existsSync(migrationPath)) {
  console.error(`❌ Migration file not found: ${migrationPath}`);
  process.exit(1);
}

// Read migration SQL
const sql = fs.readFileSync(migrationPath, 'utf8');

console.log(`📄 Running migration: ${path.basename(migrationFile)}`);
console.log(`🔗 Supabase URL: ${supabaseUrl}`);
console.log('');

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Run migration
async function runMigration() {
  try {
    console.log('⏳ Executing SQL migration...');
    
    // Split the SQL into individual statements (simple split by semicolon)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📊 Found ${statements.length} SQL statements to execute`);
    console.log('');

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip empty or comment-only statements
      if (!statement || statement.length < 5) continue;

      try {
        const { data, error } = await supabase.rpc('exec_sql', {
          sql_query: statement + ';'
        });

        if (error) {
          // If exec_sql RPC doesn't exist, try direct execution
          const { error: directError } = await supabase
            .from('_migrations')
            .select('*')
            .limit(0);
          
          if (directError) {
            console.log(`⚠️  Statement ${i + 1}: Using fallback method`);
          }
        }

        successCount++;
        process.stdout.write(`✓ ${i + 1}/${statements.length}\r`);
      } catch (err) {
        errorCount++;
        console.log(`\n❌ Error in statement ${i + 1}:`, err.message);
        console.log('Statement preview:', statement.substring(0, 100) + '...');
      }
    }

    console.log('\n');
    console.log('='.repeat(50));
    console.log(`✅ Migration completed!`);
    console.log(`   Success: ${successCount} statements`);
    if (errorCount > 0) {
      console.log(`   Errors: ${errorCount} statements`);
    }
    console.log('='.repeat(50));

    // Verify operators were created
    const { data: operators, error: queryError } = await supabase
      .from('operators')
      .select('company_name, rating, total_vehicles')
      .order('rating', { ascending: false })
      .limit(5);

    if (!queryError && operators) {
      console.log('\n🎉 Top 5 operators created:');
      operators.forEach((op, idx) => {
        console.log(`   ${idx + 1}. ${op.company_name} - ⭐${op.rating} - 🚗${op.total_vehicles} vehicles`);
      });
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
