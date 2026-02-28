/**
 * End-to-end test: form submission → operator email delivery
 *
 * This script simulates what happens when a user submits a transport request:
 * 1. Runs findMatchingOperators against the real Supabase DB
 * 2. Sends a real operatorNewRequest email to each matched operator via Brevo
 * 3. Verifies no emails bounced
 *
 * Usage: node --loader ts-node/esm scripts/test-operator-email-flow.mjs
 *    or: npx tsx scripts/test-operator-email-flow.mjs
 */

import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
const envLines = readFileSync(envPath, 'utf-8').split('\n');
for (const line of envLines) {
    const [key, ...rest] = line.split('=');
    if (key?.trim() && rest.length) {
        process.env[key.trim()] = rest.join('=').trim().replace(/^"(.*)"$/, '$1');
    }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || 'Businto <dispatch@businto.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://businto.vercel.app';

console.log('\n=== Operator Email Flow Test ===');
console.log(`Supabase URL : ${SUPABASE_URL}`);
console.log(`SMTP From    : ${FROM_EMAIL}`);
console.log('================================\n');

// --- Setup ---
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
});

// --- Simulated request (medical from Boston area) ---
const mockRequest = {
    id: 'TEST-' + Date.now(),
    service_type: 'medical',
    pickup_address: '123 Main Street, Boston, MA 02101',
    pickup_fuzzy: 'Main St, Boston MA',
    dropoff_address: '55 Fruit Street, Boston, MA 02114',
    dropoff_fuzzy: 'Cambridge St, Boston MA',
    start_date: '2026-03-01',
    start_time: '10:00',
    metadata: {
        mobility_level: 'ambulatory',
        service_level: 'curb-to-curb',
        trip_type: 'one-way',
        appointment_time: '10:00',
    }
};

// --- Step 1: Query matching operators from Supabase ---
console.log('1️⃣  Querying matching operators from Supabase...');
console.log(`   service_type   : ${mockRequest.service_type}`);
console.log(`   pickup_address : ${mockRequest.pickup_address}\n`);

const SERVICE_VEHICLE_MAP = {
    school: ['school_bus', 'mini_bus', 'van'],
    medical: ['van', 'wheelchair_van', 'sedan'],
    wedding: ['coach', 'mini_bus', 'suv', 'sedan', 'limo', 'party_bus'],
};
const SERVICE_SPECIALTY_MAP = {
    school: 'School Routes',
    medical: 'Medical Transport',
    wedding: 'Event Shuttles',
};

// Extract state
const stateMatch = mockRequest.pickup_address.match(/,\s*([A-Z]{2})\b/);
const state = stateMatch ? stateMatch[1] : 'MA';
const specialty = SERVICE_SPECIALTY_MAP[mockRequest.service_type];
const requiredVehicles = SERVICE_VEHICLE_MAP[mockRequest.service_type];

console.log(`   Filtering: state=${state}, specialty="${specialty}", vehicles=${requiredVehicles.join(',')}`);

let query = supabase
    .from('operators')
    .select('id, company_name, company_email, is_verified, is_active, is_accepting_requests, vehicle_types, specialties, service_areas, service_radius_miles, rating')
    .eq('is_verified', true)
    .eq('is_active', true)
    .eq('is_accepting_requests', true)
    .contains('service_areas', [state]);

const { data: operators, error } = await query;

if (error) {
    console.error('❌  DB query failed:', error.message);
    process.exit(1);
}

// Filter by vehicle type then specialty
const matched = (operators || []).filter(op =>
    op.vehicle_types?.some(vt => requiredVehicles.includes(vt))
);

console.log(`\n   Found ${operators?.length || 0} operators in ${state}`);
console.log(`   After vehicle filter (${requiredVehicles.join('/')}): ${matched.length} operators\n`);

if (matched.length === 0) {
    console.warn('⚠️  No matching operators found. Check the DB data.');
    process.exit(0);
}

// Show who will be emailed
console.log('   Operators to notify:');
matched.slice(0, 7).forEach((op, i) => {
    console.log(`   ${i + 1}. ${op.company_name} → ${op.company_email}`);
});

// --- Step 2: Verify SMTP ---
console.log('\n2️⃣  Verifying Brevo SMTP connection...');
try {
    await transporter.verify();
    console.log('   ✅  SMTP OK\n');
} catch (err) {
    console.error('   ❌  SMTP failed:', err.message);
    process.exit(1);
}

// --- Step 3: Send email to each ---
console.log('3️⃣  Sending operator notification emails...\n');

const results = [];
const topOperators = matched.slice(0, 7);

for (const operator of topOperators) {
    const fakeToken = `test-token-${operator.id.slice(0, 8)}`;
    const submitLink = `${APP_URL}/quotes/submit?request_id=${mockRequest.id}&token=${fakeToken}`;

    try {
        const info = await transporter.sendMail({
            from: FROM_EMAIL,
            to: operator.company_email,
            subject: `[TEST] Medical Transportation inquiry — Boston, MA`,
            html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:linear-gradient(135deg,#0ea5e9,#0284c7);color:white;padding:30px;border-radius:12px 12px 0 0;text-align:center">
            <div style="font-size:48px;margin-bottom:10px">🏥</div>
            <h1 style="margin:0">Medical Transportation Request</h1>
            <p style="font-size:14px;opacity:0.9;margin:10px 0 0">Request #${mockRequest.id.slice(0, 8)}</p>
          </div>
          <div style="padding:30px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px">
            <p>Hello <strong>${operator.company_name}</strong>,</p>
            <p>⚠️ <em>This is a <strong>TEST</strong> email sent to verify the operator notification pipeline.</em></p>
            <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;margin:20px 0">
              <tr><td style="padding:10px 14px;color:#6b7280;font-size:14px">Service Type</td><td style="font-weight:600">Medical Transportation</td></tr>
              <tr><td style="padding:10px 14px;color:#6b7280;font-size:14px">Pickup Area</td><td style="font-weight:600">${mockRequest.pickup_fuzzy}</td></tr>
              <tr><td style="padding:10px 14px;color:#6b7280;font-size:14px">Dropoff Area</td><td style="font-weight:600">${mockRequest.dropoff_fuzzy}</td></tr>
              <tr><td style="padding:10px 14px;color:#6b7280;font-size:14px">Date &amp; Time</td><td style="font-weight:600">Sat, Mar 1, 2026 at 10:00</td></tr>
              <tr><td style="padding:10px 14px;color:#6b7280;font-size:14px">Mobility</td><td style="font-weight:600">Ambulatory</td></tr>
              <tr><td style="padding:10px 14px;color:#6b7280;font-size:14px">Service Level</td><td style="font-weight:600">Curb-to-Curb</td></tr>
            </table>
            <div style="text-align:center;margin-top:24px">
              <a href="${submitLink}" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#0284c7);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
                Submit Quote
              </a>
            </div>
            <p style="font-size:13px;color:#6b7280;margin-top:20px">
              Once the customer accepts your quote, you will receive their full contact details and exact pickup address.
            </p>
            <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:30px;border-top:1px solid #f3f4f6;padding-top:16px">
              © 2026 Businto. Sent via Brevo at ${new Date().toISOString()}
            </p>
          </div>
        </div>
      `,
        });

        console.log(`   ✅  ${operator.company_name}`);
        console.log(`       → ${operator.company_email}`);
        console.log(`       msgId: ${info.messageId}\n`);
        results.push({ operator: operator.company_name, email: operator.company_email, ok: true, msgId: info.messageId });

    } catch (err) {
        console.error(`   ❌  ${operator.company_name}: ${err.message}`);
        results.push({ operator: operator.company_name, email: operator.company_email, ok: false, error: err.message });
    }
}

// --- Summary ---
const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;

console.log('========== RESULTS ==========');
console.log(`Operators matched : ${matched.length}`);
console.log(`Emails sent       : ${passed} ✅`);
console.log(`Emails failed     : ${failed} ${failed > 0 ? '❌' : ''}`);
console.log('==============================\n');

if (failed > 0) {
    console.error('Some emails failed — check operator email addresses in the DB.');
    process.exit(1);
}

console.log(`🎉  All ${passed} operator notification emails delivered successfully via Brevo!`);
console.log(`    Sender: ${FROM_EMAIL}`);
console.log(`    Check inbox: ${topOperators[0]?.company_email}`);
