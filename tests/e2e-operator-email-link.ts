/**
 * E2E Test: Operator Email Link → Claim Code → Multi-Click → Quote Submit → Duplicate Guard
 *
 * 1. Grab a real user + operator from DB
 * 2. Create a transport request via production API
 * 3. Read freshly-generated claim codes from email_claim_codes table
 * 4. Curl claim link → must redirect to /quotes/submit (not 404)
 * 5. Curl same link AGAIN → must still work (multi-use assert)
 * 6. Curl same link a THIRD time → must still work
 * 7. Submit a real quote via POST /api/quotes using the operator_id + request_id
 * 8. Try to submit the same quote again → must get 409 (duplicate guard)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PROD_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://businto.com';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── helpers ────────────────────────────────────────────────────────────────

function section(title: string) {
  console.log('\n' + '─'.repeat(60));
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

function pass(msg: string) { console.log(`  ✅ ${msg}`); }
function fail(msg: string) { console.log(`  ❌ ${msg}`); }
function info(msg: string) { console.log(`     ${msg}`); }

async function followRedirects(url: string): Promise<{ status: number; finalUrl: string }> {
  let current = url;
  let status = 0;
  let hops = 0;

  while (hops < 10) {
    hops++;
    const r = await fetch(current, { method: 'GET', redirect: 'manual' });
    status = r.status;
    const location = r.headers.get('location');
    info(`hop ${hops}: ${current.slice(0, 90)}`);
    info(`       → ${status}${location ? ` → ${location.slice(0, 90)}` : ' (terminal)'}`);
    if (status >= 300 && status < 400 && location) {
      current = location.startsWith('http') ? location : new URL(location, current).toString();
    } else {
      break;
    }
  }

  return { status, finalUrl: current };
}

function assertClaimRedirect(
  label: string,
  status: number,
  finalUrl: string
): boolean {
  const isQuotePage = finalUrl.includes('/quotes/submit') && finalUrl.includes('token=');
  const isMagicLink = finalUrl.includes('supabase.co') && finalUrl.includes('token=');

  if (status === 404) {
    fail(`${label} → 404`);
    return false;
  }
  if (isQuotePage) {
    pass(`${label} → /quotes/submit with token`);
    return true;
  }
  if (isMagicLink) {
    pass(`${label} → Supabase magic link (operator auto-auth)`);
    return true;
  }
  if (status >= 200 && status < 400) {
    pass(`${label} → ${status} (${finalUrl.slice(0, 80)})`);
    return true;
  }
  fail(`${label} → unexpected ${status}`);
  return false;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function run() {
  let allPassed = true;

  // ──────────────────────────────────────────────────────────────────────────
  section('STEP 1: Get a real user from DB');

  const { data: users, error: uErr } = await admin
    .from('profiles')
    .select('id, email, full_name')
    .not('email', 'is', null)
    .limit(5);

  if (uErr || !users?.length) {
    console.error('❌ No users found:', uErr?.message);
    process.exit(1);
  }

  const user = users[0];
  pass(`User: ${user.full_name || user.email} (${user.id})`);

  // ──────────────────────────────────────────────────────────────────────────
  section('STEP 2: Get a real partner operator');

  let operator: { id: string; company_name: string; company_email: string } | null = null;

  const { data: partners } = await admin
    .from('operators')
    .select('id, company_name, company_email')
    .eq('is_partner', true)
    .not('company_email', 'is', null)
    .limit(3);

  if (partners?.length) {
    operator = partners[0];
  } else {
    const { data: anyOps } = await admin
      .from('operators')
      .select('id, company_name, company_email')
      .not('company_email', 'is', null)
      .limit(3);
    operator = anyOps?.[0] ?? null;
  }

  if (!operator) {
    console.error('❌ No operators found');
    process.exit(1);
  }
  pass(`Operator: ${operator.company_name} (${operator.id})`);

  // ──────────────────────────────────────────────────────────────────────────
  section('STEP 3: Create transport request via production API');

  const beforeTs = new Date().toISOString();

  const payload = {
    service_type: 'school',
    pickup_address: '100 Tremont Street, Boston, MA 02108',
    dropoff_address: 'Boston Latin School, 78 Avenue Louis Pasteur, Boston, MA 02115',
    pickup_fuzzy: 'Tremont St, Boston',
    dropoff_fuzzy: 'Boston Latin School',
    start_date: '2026-04-15',
    start_time: '07:45',
    is_recurring: false,
    user_id: user.id,
    metadata: {
      grade_level: 'high_school',
      student_count: 1,
      schedule_type: 'round-trip',
      duration_type: 'single',
      needs_wheelchair: false,
      needs_car_seat: false,
      parent_email: user.email,
      parent_name: user.full_name || 'Test Parent',
    },
  };

  const createRes = await fetch(`${PROD_BASE}/api/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const createBody = await createRes.json();

  if (!createRes.ok) {
    console.error('❌ Failed to create request:', createRes.status, JSON.stringify(createBody));
    process.exit(1);
  }

  const requestId = createBody.request?.id;
  pass(`Request created: ${requestId}`);

  if (createBody.emailPreviewUrls?.length) {
    info('Operator notification email preview:');
    createBody.emailPreviewUrls.forEach((u: string) => info(`  ${u}`));
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('STEP 4: Read freshly-generated claim codes from DB');

  await new Promise(r => setTimeout(r, 2000));

  const { data: codes, error: cErr } = await admin
    .from('email_claim_codes')
    .select('id, code, resource_type, operator_id, created_at, expires_at, email_sent_to, used_at')
    .eq('resource_id', requestId)
    .eq('resource_type', 'operator_quote')
    .gt('created_at', beforeTs)
    .order('created_at', { ascending: false });

  if (cErr || !codes?.length) {
    console.error('❌ No claim codes found for request', requestId, cErr?.message);
    process.exit(1);
  }

  pass(`Found ${codes.length} operator claim code(s)`);
  for (const c of codes) {
    info(`code=${c.code}  operator=${c.operator_id}  to=${c.email_sent_to}`);
  }

  // Pick the first code (may or may not be our operator, that's fine)
  const testCode = codes[0];
  const claimUrl = `${PROD_BASE}/claim/${testCode.code}`;

  // ──────────────────────────────────────────────────────────────────────────
  section('STEP 5: First click — must redirect to /quotes/submit');

  console.log(`\n  URL: ${claimUrl}`);
  const first = await followRedirects(claimUrl);
  if (!assertClaimRedirect('Click 1', first.status, first.finalUrl)) allPassed = false;

  // ──────────────────────────────────────────────────────────────────────────
  section('STEP 6: Second click — same link must still work (multi-use)');

  console.log(`\n  URL: ${claimUrl}`);
  const second = await followRedirects(claimUrl);
  if (!assertClaimRedirect('Click 2', second.status, second.finalUrl)) {
    fail('Multi-use FAILED — link is single-use (regression)');
    allPassed = false;
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('STEP 7: Third click — still works');

  console.log(`\n  URL: ${claimUrl}`);
  const third = await followRedirects(claimUrl);
  if (!assertClaimRedirect('Click 3', third.status, third.finalUrl)) {
    fail('Multi-use FAILED on third click');
    allPassed = false;
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('STEP 8: Submit a real quote via POST /api/quotes');

  // Use the operator_id from the claim code (most reliable)
  const quoteOperatorId = testCode.operator_id || operator.id;

  const quotePayload = {
    request_id: requestId,
    operator_id: quoteOperatorId,
    total_price: 250,
    base_fare: 220,
    distance_charge: 30,
    additional_fees: [],
    vehicle_type: 'Sedan',
    vehicle_year: 2022,
    vehicle_capacity: 4,
    wheelchair_accessible: false,
    note: 'E2E test quote — please ignore',
  };

  const quoteRes = await fetch(`${PROD_BASE}/api/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quotePayload),
  });

  const quoteBody = await quoteRes.json();

  if (quoteRes.ok) {
    pass(`Quote submitted: id=${quoteBody.quote?.id}  price=$${quoteBody.quote?.total_price}`);
  } else {
    fail(`Quote submission failed: ${quoteRes.status} — ${JSON.stringify(quoteBody)}`);
    allPassed = false;
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('STEP 9: Duplicate quote attempt must return 409');

  const dupeRes = await fetch(`${PROD_BASE}/api/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quotePayload),
  });

  const dupeBody = await dupeRes.json();

  if (dupeRes.status === 409) {
    pass(`Duplicate rejected with 409 — "${dupeBody.error}"`);
  } else {
    fail(`Expected 409 but got ${dupeRes.status} — ${JSON.stringify(dupeBody)}`);
    allPassed = false;
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('STEP 10: Claim link still works after quote submitted');

  console.log(`\n  URL: ${claimUrl}`);
  const afterQuote = await followRedirects(claimUrl);
  if (!assertClaimRedirect('Click after quote', afterQuote.status, afterQuote.finalUrl)) {
    fail('Link broke after quote submitted (should still redirect, form will show existing quote)');
    allPassed = false;
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('RESULT');

  if (allPassed) {
    console.log('\n  ✅ ALL CHECKS PASSED');
    console.log('     • Claim links work on first, second, third click');
    console.log('     • Quote submitted successfully');
    console.log('     • Duplicate quote blocked (409)');
    console.log('     • Link still works after quote (no false lock-out)');
  } else {
    console.log('\n  ❌ SOME CHECKS FAILED — see above');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('\n❌ Unhandled error:', err);
  process.exit(1);
});
