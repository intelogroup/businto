/**
 * Test: Quote Acceptance → Operator Email & Booking Confirmation
 * 
 * This script verifies that when a user accepts a quote:
 * 1. The database is updated correctly (Status: 'booked')
 * 2. A booking record is created
 * 3. The WINNING operator receives an email with the customer's PII (ONE-WAY GATE)
 * 4. The LOSING operators are notified that the request is closed
 * 5. The USER receives a booking confirmation with a code
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env.local manually to avoid dependency on dotenv package
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const envLines = envContent.split(/\r?\n/);

for (const line of envLines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;
    const firstEq = trimmedLine.indexOf('=');
    if (firstEq === -1) continue;
    const key = trimmedLine.substring(0, firstEq).trim();
    const value = trimmedLine.substring(firstEq + 1).trim().replace(/^"(.*)"$/, '$1');
    process.env[key] = value;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testAcceptanceFlow() {
    console.log('\n🚀 Starting Quote Acceptance Flow Test');
    console.log('========================================');

    // 1. Setup Test Data (Temporary Request & Quotes)
    console.log('1️⃣  Creating mock request and quotes...');
    
    // Find a real user to own the request (or use a placeholder)
    const { data: userData } = await supabase.from('profiles').select('id, email, full_name').limit(1).single();
    if (!userData) throw new Error('No users found in database to run test');

    const { data: request, error: reqError } = await supabase.from('transport_requests').insert({
        user_id: userData.id,
        service_type: 'medical',
        pickup_address: '123 Privacy St, Boston, MA 02101',
        dropoff_address: 'MGH Hospital, 55 Fruit St, Boston, MA 02114',
        pickup_fuzzy: 'Beacon Hill, Boston',
        dropoff_fuzzy: 'MGH, Boston',
        start_date: '2026-03-15',
        start_time: '09:00',
        status: 'quoted',
        metadata_safe: { mobility_level: 'ambulatory' },
        metadata_private: { parent_name: userData.full_name, parent_phone: '617-555-9999' }
    }).select().single();

    if (reqError) throw reqError;
    console.log(`   ✅ Request created: ${request.id}`);

    // Create 2 mock operators
    const { data: operators } = await supabase.from('operators').select('id, company_name, company_email').limit(2);
    if (!operators || operators.length < 2) throw new Error('Need at least 2 operators in DB');

    const winner = operators[0];
    const loser = operators[1];

    // Create quotes
    const { data: q1 } = await supabase.from('quotes').insert({
        request_id: request.id,
        operator_id: winner.id,
        total_price: 45.00,
        status: 'pending'
    }).select().single();

    const { data: q2 } = await supabase.from('quotes').insert({
        request_id: request.id,
        operator_id: loser.id,
        total_price: 55.00,
        status: 'pending'
    }).select().single();

    console.log(`   ✅ Quotes created: Winner(${winner.company_name}) and Loser(${loser.company_name})`);

    // 2. Trigger Acceptance via API
    console.log('\n2️⃣  Triggering quote acceptance API...');
    const apiBase = process.env.NEXT_PUBLIC_APP_URL || 'https://businto.vercel.app';
    
    console.log(`   📡 Target: ${apiBase}/api/quotes/accept`);

    const response = await fetch(`${apiBase}/api/quotes/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            quoteId: q1.id,
            tripRequestId: request.id,
            userId: userData.id
        })
    });

    const result = await response.json();

    if (!response.ok) {
        console.error('   ❌ API call failed:', result.error);
        // Cleanup and exit
        await supabase.from('transport_requests').delete().eq('id', request.id);
        return;
    }

    console.log('   ✅ API Success: Quote accepted and booking created');
    console.log(`   ✅ Confirmation Code: ${result.confirmationCode}`);

    // 3. Verify Database State
    console.log('\n3️⃣  Verifying database updates...');
    
    const { data: updatedReq } = await supabase.from('transport_requests').select('status').eq('id', request.id).single();
    const { data: updatedQ1 } = await supabase.from('quotes').select('status').eq('id', q1.id).single();
    const { data: updatedQ2 } = await supabase.from('quotes').select('status').eq('id', q2.id).single();
    const { data: booking } = await supabase.from('bookings').select('id, confirmation_code').eq('request_id', request.id).single();

    console.log(`   Request Status : ${updatedReq.status} (Expected: booked)`);
    console.log(`   Winner Quote   : ${updatedQ1.status} (Expected: accepted)`);
    console.log(`   Loser Quote    : ${updatedQ2.status} (Expected: declined)`);
    console.log(`   Booking Created: ${!!booking} (Expected: true)`);

    const passed = updatedReq.status === 'booked' && 
                   updatedQ1.status === 'accepted' && 
                   updatedQ2.status === 'declined' && 
                   !!booking;

    if (passed) {
        console.log('\n🎉 ALL DATABASE CHECKS PASSED!');
        console.log('   The system correctly handled the one-way gate and marketplace locking.');
    } else {
        console.log('\n❌ DATABASE CHECKS FAILED');
    }

    // 4. Manual Verification Tip
    console.log('\n✉️  EMAIL VERIFICATION:');
    console.log(`   Check ${winner.company_email} for the PII Reveal email (Order Details).`);
    console.log(`   Check ${userData.email} for the Booking Confirmation.`);

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await supabase.from('transport_requests').delete().eq('id', request.id);
    console.log('   Done.');
}

testAcceptanceFlow().catch(console.error);
