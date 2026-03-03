/**
 * Comprehensive Resend Email Test
 * 
 * Tests various email scenarios with Resend to verify:
 * - Claim links are not corrupted
 * - URLs survive tracking wrapper attempts
 * - Email delivery success
 * 
 * Usage: npm run test-resend
 */

import { Resend } from 'resend';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') });

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TEST_EMAIL = process.env.TEST_EMAIL || 'delivered@resend.dev'; // Resend's test email
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || 'Businto <noreply@businto.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://businto.com';

console.log('🚀 RESEND EMAIL TEST SUITE');
console.log('═'.repeat(60));
console.log('Configuration:');
console.log(`  API Key: ${RESEND_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`  From: ${FROM_EMAIL}`);
console.log(`  To: ${TEST_EMAIL}`);
console.log(`  App URL: ${APP_URL}`);
console.log('═'.repeat(60));

if (!RESEND_API_KEY) {
  console.error('\n❌ ERROR: RESEND_API_KEY is not set in .env.local');
  console.log('Please add: RESEND_API_KEY=re_your_key_here');
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);

// Test scenarios
const tests = [
  {
    name: 'Claim Link - Operator Notification',
    subject: 'New Service Request - Businto',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; }
            code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>New Service Request</h1>
            <p>Hi Operator,</p>
            <p>A new service request has been submitted in your area.</p>
            
            <h2>📍 Service Details</h2>
            <ul>
              <li>Service Type: Medical Transport</li>
              <li>Pickup: 123 Main St, Boston MA</li>
              <li>Dropoff: Boston Medical Center</li>
              <li>Date: January 20, 2026</li>
            </ul>
            
            <p><strong>🎯 CRITICAL: Claim Link</strong></p>
            <p>This link should NOT be wrapped or modified:</p>
            <a href="${APP_URL}/claim/OP123ABC789" class="button">View Request & Quote</a>
            
            <p style="margin-top: 20px; color: #666; font-size: 14px;">
              <strong>Link for debugging:</strong><br/>
              <code>${APP_URL}/claim/OP123ABC789</code>
            </p>
            
            <p style="margin-top: 30px; color: #999; font-size: 12px;">
              Timestamp: ${new Date().toISOString()}
            </p>
          </div>
        </body>
      </html>
    `,
  },
  {
    name: 'User Quote Received Email',
    subject: 'New Quote Received - $145.00',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; }
            .quote-card { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
            code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>New Quote Received!</h1>
            <p>Hi John,</p>
            <p>An operator has sent you a quote for your service request.</p>
            
            <div class="quote-card">
              <h2 style="margin-top: 0;">Boston Transit Co.</h2>
              <p style="font-size: 28px; color: #16a34a; margin: 10px 0;"><strong>$145.00</strong></p>
              <p style="color: #666;">Wheelchair Accessible Van</p>
              <a href="${APP_URL}/claim/QUOTE456DEF" class="button">View Quote Details</a>
            </div>
            
            <p style="margin-top: 20px; color: #666; font-size: 14px;">
              <strong>Link for debugging:</strong><br/>
              <code>${APP_URL}/claim/QUOTE456DEF</code>
            </p>
          </div>
        </body>
      </html>
    `,
  },
  {
    name: 'Multi-Link Test',
    subject: 'Email with Multiple Links',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .section { margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 8px; }
            .link-item { margin: 10px 0; }
            code { background: white; padding: 4px 8px; border-radius: 4px; border: 1px solid #ddd; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>All Links Test</h1>
            
            <div class="section">
              <h3>Claim Links (Most Critical)</h3>
              <div class="link-item">
                <strong>1. Operator Claim:</strong><br/>
                <a href="${APP_URL}/claim/CLAIM001">Link 1</a><br/>
                <code>${APP_URL}/claim/CLAIM001</code>
              </div>
              <div class="link-item">
                <strong>2. Quote Claim:</strong><br/>
                <a href="${APP_URL}/claim/CLAIM002">Link 2</a><br/>
                <code>${APP_URL}/claim/CLAIM002</code>
              </div>
            </div>
            
            <div class="section">
              <h3>Internal Links</h3>
              <div class="link-item">
                <strong>Dashboard:</strong> <a href="${APP_URL}/dashboard">View Dashboard</a>
              </div>
              <div class="link-item">
                <strong>Requests:</strong> <a href="${APP_URL}/requests">View Requests</a>
              </div>
            </div>
            
            <div class="section">
              <h3>External Links</h3>
              <div class="link-item">
                <strong>Website:</strong> <a href="https://example.com">Example.com</a>
              </div>
            </div>
            
            <p style="margin-top: 30px; color: #999; font-size: 12px;">
              Test sent: ${new Date().toISOString()}
            </p>
          </div>
        </body>
      </html>
    `,
  },
];

async function runTests() {
  const results = [];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n\n${'═'.repeat(60)}`);
    console.log(`TEST ${i + 1}/${tests.length}: ${test.name}`);
    console.log(`${'═'.repeat(60)}`);

    try {
      console.log(`📧 Sending: ${test.subject}`);
      
      const response = await resend.emails.send({
        from: FROM_EMAIL,
        to: TEST_EMAIL,
        subject: test.subject,
        html: test.html,
      });

      if (response.error) {
        console.error(`❌ Error: ${response.error.message}`);
        results.push({
          test: test.name,
          status: 'FAILED',
          error: response.error.message,
        });
      } else {
        console.log(`✅ Sent successfully!`);
        console.log(`   Email ID: ${response.data?.id}`);
        
        // Extract and display links
        const linkRegex = /href="([^"]+)"/g;
        const matches = test.html.matchAll(linkRegex);
        const links = [...matches].map(m => m[1]);
        
        console.log(`\n   📎 Links in email (${links.length}):`);
        links.forEach((link, idx) => {
          const isClaim = link.includes('/claim/');
          const indicator = isClaim ? '🎯 CLAIM' : '🔗 OTHER';
          console.log(`      ${indicator}: ${link}`);
        });
        
        results.push({
          test: test.name,
          status: 'SUCCESS',
          messageId: response.data?.id,
          linkCount: links.length,
        });
      }
    } catch (error) {
      console.error(`💥 Exception: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        test: test.name,
        status: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log(`\n\n${'═'.repeat(60)}`);
  console.log('📊 TEST SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  
  results.forEach((r, idx) => {
    const status = r.status === 'SUCCESS' ? '✅' : r.status === 'FAILED' ? '❌' : '💥';
    console.log(`${status} Test ${idx + 1}: ${r.test}`);
    if (r.messageId) {
      console.log(`   Message ID: ${r.messageId}`);
      console.log(`   Links: ${r.linkCount}`);
    }
    if (r.error) {
      console.log(`   Error: ${r.error}`);
    }
  });

  const passed = results.filter(r => r.status === 'SUCCESS').length;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Results: ${passed}/${results.length} tests passed`);
  console.log(`${'═'.repeat(60)}`);

  console.log(`\n✅ Next Steps:`);
  console.log(`1. Check emails at: ${TEST_EMAIL}`);
  console.log(`2. For live testing, use a real email address (change TEST_EMAIL)`);
  console.log(`3. Click each link and verify URL integrity`);
  console.log(`4. Check browser DevTools Network tab for actual link URLs`);
}

runTests().catch(console.error);
