/**
 * Test Resend Email Service
 * 
 * This script tests sending emails via Resend to verify:
 * 1. Link integrity (URLs not corrupted)
 * 2. Claim links survive Resend tracking wrapping
 * 3. Email delivery and rendering
 * 
 * Usage: node scripts/test-resend-email.mjs
 */

import { Resend } from 'resend';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') });

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || 'noreply@businto.com';
const TEST_EMAIL = 'your-email@example.com'; // Change this to your test email

if (!RESEND_API_KEY) {
  console.error('❌ RESEND_API_KEY is not set in .env.local');
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://businto.com';

// Test HTML with various links
const testHtml = `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
      .links { margin-top: 20px; padding: 20px; background: #f5f5f5; border-radius: 8px; }
      .link-item { margin: 10px 0; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Email Link Integrity Test</h1>
      <p>This email tests whether links remain intact when sent via Resend.</p>
      
      <h2>Claim Link (Most Important)</h2>
      <p>This link should NOT be wrapped or corrupted:</p>
      <a href="${APP_BASE_URL}/claim/TEST123ABC" class="button">View Claim</a>
      
      <h2>All Links in Email</h2>
      <div class="links">
        <div class="link-item">
          <strong>Claim Link:</strong><br/>
          <code>${APP_BASE_URL}/claim/TEST123ABC</code>
        </div>
        <div class="link-item">
          <strong>Direct Link:</strong><br/>
          <a href="${APP_BASE_URL}/quotes/submit?token=test_token_123">Submit Quote</a>
        </div>
        <div class="link-item">
          <strong>Dashboard:</strong><br/>
          <a href="${APP_BASE_URL}/dashboard">Dashboard</a>
        </div>
        <div class="link-item">
          <strong>External Link:</strong><br/>
          <a href="https://example.com">Example</a>
        </div>
      </div>
      
      <p style="margin-top: 30px; color: #999; font-size: 12px;">
        Sent at: ${new Date().toISOString()}
      </p>
    </div>
  </body>
</html>
`;

async function sendTestEmail() {
  console.log('🚀 Testing Resend Email Service');
  console.log('═'.repeat(50));
  console.log(`API Key: ${RESEND_API_KEY.substring(0, 10)}...`);
  console.log(`From: ${FROM_EMAIL}`);
  console.log(`To: ${TEST_EMAIL}`);
  console.log(`App URL: ${APP_BASE_URL}`);
  console.log('═'.repeat(50));

  try {
    console.log('\n📧 Sending test email via Resend...\n');

    const response = await resend.emails.send({
      from: FROM_EMAIL,
      to: TEST_EMAIL,
      subject: 'Businto - Email Link Integrity Test (Resend)',
      html: testHtml,
    });

    if (response.error) {
      console.error('❌ Resend API Error:', response.error);
      return;
    }

    console.log('✅ Email sent successfully!');
    console.log('\n📊 Response Details:');
    console.log('─'.repeat(50));
    console.log(`Email ID: ${response.data?.id}`);
    console.log(`Status: ${response.data ? 'Sent' : 'Pending'}`);
    console.log('─'.repeat(50));

    console.log('\n🔍 Link Validation:');
    console.log('─'.repeat(50));

    // Extract links from HTML
    const linkRegex = /href="([^"]+)"/g;
    const links = [...testHtml.matchAll(linkRegex)].map(m => m[1]);

    links.forEach((link, i) => {
      const isClaim = link.includes('/claim/');
      const indicator = isClaim ? '🎯' : '🔗';
      console.log(`${indicator} Link ${i + 1}: ${link}`);
    });

    console.log('\n✅ Test Complete!');
    console.log('\nNext steps:');
    console.log('1. Check your email at:', TEST_EMAIL);
    console.log('2. Verify all links are working correctly');
    console.log('3. Click the claim link and verify the URL is not wrapped');
    console.log('4. Check browser DevTools (Network tab) to see the actual link');

  } catch (error) {
    console.error('💥 Error:', error);
    process.exit(1);
  }
}

sendTestEmail();
