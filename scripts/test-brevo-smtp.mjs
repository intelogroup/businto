/**
 * Brevo SMTP live test
 * Sends both a user-facing confirmation email AND an operator notification
 * to verify the full email workflow is working before production.
 *
 * Usage: node scripts/test-brevo-smtp.mjs
 */

import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env.local manually (no dotenv dep)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
const envLines = readFileSync(envPath, 'utf-8').split('\n');
for (const line of envLines) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim().replace(/^"(.*)"$/, '$1');
}

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || 'Businto <noreply@businto.com>';
const TEST_TO = process.env.SMTP_USER; // send to yourself as proof

console.log('\n=== Brevo SMTP Verification ===');
console.log(`  Host  : ${SMTP_HOST}`);
console.log(`  Port  : ${SMTP_PORT}`);
console.log(`  User  : ${SMTP_USER}`);
console.log(`  From  : ${FROM_EMAIL}`);
console.log(`  Send to: ${TEST_TO}`);
console.log('================================\n');

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error('❌  Missing SMTP credentials in .env.local');
    process.exit(1);
}

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // STARTTLS on 587
    auth: { user: SMTP_USER, pass: SMTP_PASS },
});

// --- verify connection ---
console.log('1️⃣  Verifying SMTP connection...');
try {
    await transporter.verify();
    console.log('   ✅  SMTP connection OK\n');
} catch (err) {
    console.error('   ❌  SMTP verify failed:', err.message);
    process.exit(1);
}

// --- helper ---
async function send(label, mailOpts) {
    console.log(`${label}...`);
    try {
        const info = await transporter.sendMail({ from: FROM_EMAIL, ...mailOpts });
        console.log(`   ✅  Sent  | msgId: ${info.messageId} | accepted: ${info.accepted.join(', ')}`);
        return true;
    } catch (err) {
        console.error(`   ❌  Failed: ${err.message}`);
        return false;
    }
}

// --- 1. User confirmation (mirrors requestConfirmation template) ---
const userOk = await send('2️⃣  Sending USER confirmation email', {
    to: TEST_TO,
    subject: '[TEST] Your Transport Request Has Been Submitted',
    html: `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;padding:30px;border-radius:12px 12px 0 0;text-align:center">
        <h1>Request Submitted!</h1>
      </div>
      <div style="padding:30px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px">
        <p>Hi <strong>Test User</strong>,</p>
        <p>✅ This is a <strong>live Brevo SMTP test</strong> confirming that user confirmation emails work.</p>
        <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;margin:20px 0">
          <tr><td style="padding:8px 12px;color:#6b7280">Service Type</td><td style="font-weight:600">Medical Transportation</td></tr>
          <tr><td style="padding:8px 12px;color:#6b7280">Pickup</td><td style="font-weight:600">123 Main St, Boston MA</td></tr>
          <tr><td style="padding:8px 12px;color:#6b7280">Destination</td><td style="font-weight:600">Mass General Hospital</td></tr>
          <tr><td style="padding:8px 12px;color:#6b7280">Date</td><td style="font-weight:600">2026-02-25</td></tr>
        </table>
        <p>Operators are being notified. Check your dashboard for quotes.</p>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:30px">© 2026 Businto. SMTP test sent via Brevo at ${new Date().toISOString()}</p>
      </div>
    </div>
  `,
});

// --- 2. Operator notification (mirrors operatorNewRequest template) ---
const operatorOk = await send('3️⃣  Sending OPERATOR notification email', {
    to: TEST_TO,
    subject: '[TEST] Medical Transportation inquiry — Boston, MA',
    html: `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#0ea5e9,#0284c7);color:white;padding:30px;border-radius:12px 12px 0 0;text-align:center">
        <div style="font-size:48px;margin-bottom:10px">🏥</div>
        <h1>Medical Transportation Request</h1>
        <p style="font-size:14px;opacity:0.9">Request #TESTABCD</p>
      </div>
      <div style="padding:30px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px">
        <p>Hello <strong>Alpha Transit</strong>,</p>
        <p>✅ This is a <strong>live Brevo SMTP test</strong> confirming that operator notification emails work.</p>
        <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;margin:20px 0">
          <tr><td style="padding:8px 12px;color:#6b7280">Service Type</td><td style="font-weight:600">Medical Transportation</td></tr>
          <tr><td style="padding:8px 12px;color:#6b7280">Pickup Area</td><td style="font-weight:600">Main St, Boston MA</td></tr>
          <tr><td style="padding:8px 12px;color:#6b7280">Dropoff Area</td><td style="font-weight:600">Cambridge St, Boston MA</td></tr>
          <tr><td style="padding:8px 12px;color:#6b7280">Date &amp; Time</td><td style="font-weight:600">Tue, Feb 25, 2026 at 10:00</td></tr>
        </table>
        <div style="text-align:center">
          <a href="https://businto.com/quotes/submit?request_id=test&token=test"
             style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#0284c7);color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px">
            Submit Quote (test link)
          </a>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:30px">© 2026 Businto. SMTP test sent via Brevo at ${new Date().toISOString()}</p>
      </div>
    </div>
  `,
});

// --- 3. Quote received (mirrors quoteReceived template) ---
const quoteOk = await send('4️⃣  Sending QUOTE RECEIVED email (user side)', {
    to: TEST_TO,
    subject: '[TEST] New Quote Received: $85.00 from Alpha Transit',
    html: `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#059669,#10b981);color:white;padding:30px;border-radius:12px 12px 0 0;text-align:center">
        <h1>New Quote Received!</h1>
      </div>
      <div style="padding:30px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px">
        <p>Hi <strong>Test User</strong>,</p>
        <p>✅ This is a <strong>live Brevo SMTP test</strong> confirming that quote notification emails work.</p>
        <div style="background:#f0fdf4;border:2px solid #22c55e;padding:20px;border-radius:8px;margin:20px 0;text-align:center">
          <div style="font-size:36px;font-weight:bold;color:#16a34a">$85.00</div>
          <div style="font-size:18px;margin-top:10px">Alpha Transit</div>
          <div style="color:#6b7280;font-size:14px">Coach Bus</div>
        </div>
        <a href="https://businto.com/dashboard/requests"
           style="display:inline-block;background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px">
          View &amp; Accept Quote
        </a>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:30px">© 2026 Businto. SMTP test sent via Brevo at ${new Date().toISOString()}</p>
      </div>
    </div>
  `,
});

// --- Summary ---
console.log('\n========== RESULTS ==========');
console.log(`User confirmation  : ${userOk ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Operator notify    : ${operatorOk ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Quote received     : ${quoteOk ? '✅ PASS' : '❌ FAIL'}`);
console.log('==============================\n');

if (!userOk || !operatorOk || !quoteOk) {
    console.error('One or more emails failed — check SMTP credentials.');
    process.exit(1);
}
console.log('🎉  All emails sent successfully via Brevo!');
console.log(`    Check inbox: ${TEST_TO}`);
