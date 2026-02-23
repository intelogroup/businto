#!/usr/bin/env node

/**
 * Data Migration Script: Split Existing Metadata
 * 
 * This script migrates existing transport_requests by splitting the legacy
 * 'metadata' field into 'metadata_safe' and 'metadata_private' based on
 * service type.
 * 
 * IMPORTANT: Run this AFTER applying the schema migration that adds the new columns.
 * 
 * Usage:
 *   node scripts/migrate-split-metadata.js [--dry-run] [--backup]
 * 
 * Options:
 *   --dry-run    Show what would be changed without making changes
 *   --backup     Create a backup of affected records before migration
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shouldBackup = args.includes('--backup');

// Field categorization by service type
const FIELD_CATEGORIES = {
  school: {
    safe: [
      'school_name', 'grade_level', 'student_count', 'schedule_type',
      'am_pickup_time', 'pm_pickup_time', 'special_needs', 'duration_type',
      'needs_wheelchair', 'needs_car_seat', 'special_requirements', 'note'
    ],
    private: ['parent_name', 'parent_phone', 'parent_email']
  },
  medical: {
    safe: [
      'mobility_level', 'service_level', 'trip_type', 'appointment_time',
      'return_time', 'special_equipment', 'oxygen_required', 'wheelchair_type',
      'attendant_needed', 'medical_notes', 'note'
    ],
    private: [
      'patient_name', 'contact_name', 'contact_phone', 'contact_email',
      'emergency_contact', 'emergency_phone'
    ]
  },
  wedding: {
    safe: [
      'guest_count', 'vehicle_style', 'itinerary_type', 'event_name',
      'pickup_time', 'return_time', 'special_requests', 'duration_hours',
      'service_level', 'note'
    ],
    private: ['contact_name', 'contact_phone', 'contact_email']
  },
  corporate: {
    safe: [
      'employee_count', 'trip_purpose', 'vehicle_style', 'service_level',
      'return_trip', 'special_requests', 'note'
    ],
    private: [
      'contact_name', 'contact_phone', 'contact_email',
      'billing_contact', 'billing_email'
    ]
  }
};

/**
 * Split metadata into safe and private based on service type
 */
function splitMetadata(metadata, serviceType) {
  if (!metadata || typeof metadata !== 'object') {
    return { metadata_safe: {}, metadata_private: {} };
  }

  const categories = FIELD_CATEGORIES[serviceType];
  if (!categories) {
    console.warn(`⚠️  Unknown service type: ${serviceType}, keeping all fields as safe`);
    return { metadata_safe: metadata, metadata_private: {} };
  }

  const metadata_safe = {};
  const metadata_private = {};
  const unknown_fields = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (categories.safe.includes(key)) {
      metadata_safe[key] = value;
    } else if (categories.private.includes(key)) {
      metadata_private[key] = value;
    } else {
      unknown_fields.push(key);
      // Default to safe for unknown fields (conservative approach)
      metadata_safe[key] = value;
    }
  }

  if (unknown_fields.length > 0) {
    console.warn(`⚠️  Unknown fields found (keeping as safe): ${unknown_fields.join(', ')}`);
  }

  return { metadata_safe, metadata_private };
}

/**
 * Create backup of records before migration
 */
async function createBackup(records) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'backups');
  const backupFile = path.join(backupDir, `transport_requests_backup_${timestamp}.json`);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  fs.writeFileSync(backupFile, JSON.stringify(records, null, 2));
  console.log(`✅ Backup created: ${backupFile}`);
  return backupFile;
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('🚀 Starting metadata split migration...\n');
  
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  // Fetch all transport requests with metadata
  console.log('📥 Fetching transport requests...');
  const { data: requests, error } = await supabase
    .from('transport_requests')
    .select('id, service_type, metadata, metadata_safe, metadata_private')
    .not('metadata', 'is', null);

  if (error) {
    console.error('❌ Error fetching requests:', error);
    process.exit(1);
  }

  if (!requests || requests.length === 0) {
    console.log('✅ No records to migrate (all metadata fields are null)');
    return;
  }

  console.log(`📊 Found ${requests.length} records with metadata\n`);

  // Create backup if requested
  if (shouldBackup && !isDryRun) {
    await createBackup(requests);
  }

  // Process each request
  const updates = [];
  let skippedCount = 0;

  for (const request of requests) {
    // Skip if already split
    if (request.metadata_safe || request.metadata_private) {
      console.log(`⏭️  Skipping ${request.id} - already has split metadata`);
      skippedCount++;
      continue;
    }

    const { metadata_safe, metadata_private } = splitMetadata(
      request.metadata,
      request.service_type
    );

    updates.push({
      id: request.id,
      service_type: request.service_type,
      metadata_safe,
      metadata_private,
    });

    console.log(`✓ Prepared ${request.id} (${request.service_type})`);
    console.log(`  Safe fields: ${Object.keys(metadata_safe).length}`);
    console.log(`  Private fields: ${Object.keys(metadata_private).length}`);
  }

  console.log(`\n📈 Summary:`);
  console.log(`   Total records: ${requests.length}`);
  console.log(`   To update: ${updates.length}`);
  console.log(`   Skipped: ${skippedCount}`);

  if (updates.length === 0) {
    console.log('\n✅ Nothing to migrate!');
    return;
  }

  if (isDryRun) {
    console.log('\n🔍 DRY RUN - Would update these records:');
    updates.slice(0, 5).forEach(u => {
      console.log(`   ${u.id}: ${Object.keys(u.metadata_safe).length} safe, ${Object.keys(u.metadata_private).length} private`);
    });
    if (updates.length > 5) {
      console.log(`   ... and ${updates.length - 5} more`);
    }
    return;
  }

  // Perform updates
  console.log('\n💾 Updating records...');
  let successCount = 0;
  let errorCount = 0;

  for (const update of updates) {
    const { error } = await supabase
      .from('transport_requests')
      .update({
        metadata_safe: update.metadata_safe,
        metadata_private: update.metadata_private,
      })
      .eq('id', update.id);

    if (error) {
      console.error(`❌ Error updating ${update.id}:`, error.message);
      errorCount++;
    } else {
      successCount++;
    }
  }

  console.log('\n✅ Migration complete!');
  console.log(`   Successful: ${successCount}`);
  console.log(`   Errors: ${errorCount}`);

  if (errorCount > 0) {
    console.log('\n⚠️  Some records failed to update. Check the errors above.');
    process.exit(1);
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('\n🎉 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
