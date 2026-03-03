/**
 * Side-by-Side Email Provider Comparison
 * 
 * Tests the same email with multiple providers to compare:
 * - Link handling
 * - URL wrapping behavior  
 * - Tracking implementation
 * - Delivery success
 * 
 * Providers: Resend, Brevo (SMTP), Ethereal (Testing)
 * 
 * Usage: npm run test:compare-providers
 */

import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://businto.com';
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || 'noreply@businto.com';

// Test email content
const testEmailContent = {
  subject: 'Claim Link Test - Provider Comparison',
  html: `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; }
          .test-info { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; }
          code { background: white; padding: 4px 8px; border-radius: 4px; border: 1px solid #ddd; font-family: monospace; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Email Provider Comparison Test</h1>
          <p>This email tests claim link integrity across different providers.</p>
          
          <div class="test-info">
            <h3>Test 1: Claim Link Button</h3>
            <a href="${APP_URL}/claim/TEST123ABC" class="button">View Claim</a>
            <p><strong>Link:</strong> <code>${APP_URL}/claim/TEST123ABC</code></p>
          </div>
          
          <div class="test-info">
            <h3>Test 2: Plain Text Link</h3>
            <p><a href="${APP_URL}/claim/OPERATOR456">https://businto.com/claim/OPERATOR456</a></p>
          </div>
          
          <div class="test-info">
            <h3>Test 3: Multiple Claims</h3>
            <ul>
              <li><a href="${APP_URL}/claim/CLAIM001">Claim 1</a></li>
              <li><a href="${APP_URL}/claim/CLAIM002">Claim 2</a></li>
              <li><a href="${APP_URL}/claim/CLAIM003">Claim 3</a></li>
            </ul>
          </div>
          
          <p style="margin-top: 30px; color: #999; font-size: 12px;">
            Test sent: ${new Date().toISOString()}
          </p>
        </div>
      </body>
    </html>
  `,
};

// Provider configurations
const providers = {
  resend: {
    name: 'Resend',
    icon: '🚀',
    test: async (testEmail) => {
      if (!process.env.RESEND_API_KEY) {
        return { status: 'SKIPPED', reason: 'RESEND_API_KEY not set' };
      }

      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const response = await resend.emails.send({
          from: FROM_EMAIL,
          to: testEmail,
          subject: testEmailContent.subject,
          html: testEmailContent.html,
        });

        if (response.error) {
          return { status: 'FAILED', error: response.error.message };
        }

        return {
          status: 'SUCCESS',
          messageId: response.data?.id,
          details: {
            provider: 'Resend',
            linkWrapping: '❌ No (Resend preserves links)',
            trackingMethod: 'Hidden pixels (no URL modification)',
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        return { status: 'ERROR', error: error instanceof Error ? error.message : String(error) };
      }
    },
  },

  brevo: {
    name: 'Brevo SMTP',
    icon: '📧',
    test: async (testEmail) => {
      const brevoKey = process.env.BREVO_SMTP_KEY || process.env.BREVO_API_KEY;
      const smtpHost = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
      const smtpPort = Number(process.env.SMTP_PORT || 587);
      const smtpUser = process.env.SMTP_USER || process.env.BREVO_SMTP_LOGIN;

      if (!brevoKey || !smtpUser) {
        return { status: 'SKIPPED', reason: 'Brevo credentials not configured' };
      }

      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: false,
          auth: {
            user: smtpUser,
            pass: brevoKey,
          },
        });

        const info = await transporter.sendMail({
          from: FROM_EMAIL,
          to: testEmail,
          subject: testEmailContent.subject,
          html: testEmailContent.html,
          headers: {
            'X-Mailin-Tag': 'test-comparison',
            'X-Mailin-Track-Click': '1',
          },
        });

        return {
          status: 'SUCCESS',
          messageId: info.messageId,
          details: {
            provider: 'Brevo SMTP',
            linkWrapping: '⚠️  Yes (may modify URLs)',
            trackingMethod: 'Click tracking via URL wrapping',
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        return { status: 'ERROR', error: error instanceof Error ? error.message : String(error) };
      }
    },
  },

  ethereal: {
    name: 'Ethereal (Testing)',
    icon: '🧪',
    test: async (testEmail) => {
      try {
        const testAccount = await nodemailer.createTestAccount();
        const transporter = nodemailer.createTransport({
          host: testAccount.smtp.host,
          port: testAccount.smtp.port,
          secure: testAccount.smtp.secure,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });

        const info = await transporter.sendMail({
          from: FROM_EMAIL,
          to: testEmail,
          subject: testEmailContent.subject,
          html: testEmailContent.html,
        });

        const previewUrl = nodemailer.getTestMessageUrl(info);

        return {
          status: 'SUCCESS',
          messageId: info.messageId,
          previewUrl: previewUrl || undefined,
          details: {
            provider: 'Ethereal (Testing)',
            linkWrapping: '❌ No (test provider)',
            trackingMethod: 'None (testing only)',
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        return { status: 'ERROR', error: error instanceof Error ? error.message : String(error) };
      }
    },
  },
};

async function runComparison() {
  const testEmail = process.env.TEST_EMAIL || 'delivered@resend.dev';

  console.log('\n📊 EMAIL PROVIDER COMPARISON TEST');
  console.log('═'.repeat(70));
  console.log(`Test Email: ${testEmail}`);
  console.log(`From: ${FROM_EMAIL}`);
  console.log(`App URL: ${APP_URL}`);
  console.log('═'.repeat(70));

  const results = [];

  // Test each provider
  for (const [key, provider] of Object.entries(providers)) {
    console.log(`\n${provider.icon} ${provider.name}`);
    console.log('─'.repeat(70));

    try {
      const result = await provider.test(testEmail);
      results.push({ key, name: provider.name, ...result });

      if (result.status === 'SKIPPED') {
        console.log(`⏭️  Skipped: ${result.reason}`);
      } else if (result.status === 'SUCCESS') {
        console.log(`✅ Success`);
        console.log(`   Message ID: ${result.messageId}`);
        if (result.details) {
          Object.entries(result.details).forEach(([k, v]) => {
            if (k !== 'provider') {
              console.log(`   ${k}: ${v}`);
            }
          });
        }
        if (result.previewUrl) {
          console.log(`   Preview: ${result.previewUrl}`);
        }
      } else if (result.status === 'FAILED') {
        console.log(`❌ Failed: ${result.error}`);
      } else if (result.status === 'ERROR') {
        console.log(`💥 Error: ${result.error}`);
      }
    } catch (error) {
      console.error(`💥 Exception: ${error instanceof Error ? error.message : String(error)}`);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log('\n\n📋 COMPARISON SUMMARY');
  console.log('═'.repeat(70));

  const successful = results.filter(r => r.status === 'SUCCESS');
  const skipped = results.filter(r => r.status === 'SKIPPED');

  console.log(`\nResults:`);
  console.log(`  ✅ Successful: ${successful.length}`);
  console.log(`  ⏭️  Skipped: ${skipped.length}`);
  console.log(`  ❌ Failed: ${results.filter(r => r.status === 'FAILED').length}`);
  console.log(`  💥 Errors: ${results.filter(r => r.status === 'ERROR').length}`);

  if (successful.length > 0) {
    console.log(`\n✅ Providers Tested:`);
    successful.forEach(r => {
      console.log(`   • ${r.name}: ${r.messageId}`);
    });
  }

  // Provider comparison
  console.log('\n\n🔍 LINK HANDLING COMPARISON');
  console.log('─'.repeat(70));
  console.log('Provider          | Link Wrapping | Tracking Method');
  console.log('─'.repeat(70));

  const providerComparison = {
    'Resend': { wrapping: '❌ No', tracking: 'Hidden pixels' },
    'Brevo SMTP': { wrapping: '⚠️  Yes', tracking: 'URL wrapping' },
    'Ethereal': { wrapping: '❌ No', tracking: 'None' },
  };

  Object.entries(providerComparison).forEach(([name, config]) => {
    const namePadded = name.padEnd(17);
    const wrappingPadded = config.wrapping.padEnd(13);
    console.log(`${namePadded} | ${wrappingPadded} | ${config.tracking}`);
  });

  console.log('\n\n📊 RECOMMENDATIONS');
  console.log('─'.repeat(70));
  console.log(`
  For Claim Link Integrity (No Wrapping):
    ✅ Resend - Recommended (no URL modification)
    ✅ Ethereal - Good for testing
    ⚠️  Brevo - May wrap links (but headers can disable tracking)

  For Production Use:
    🏆 Resend - Best link handling + modern API
    📧 Brevo - Works with proper headers to disable tracking
    🧪 Ethereal - Testing only

  For Tracking Without Link Corruption:
    ✅ Resend - Hidden pixel tracking (URLs stay clean)
    ❌ Brevo - URL wrapping (harder to prevent)
`);

  console.log('\n✅ Test Complete!');
  console.log(`\nNext steps:`);
  console.log(`1. Check your email at: ${testEmail}`);
  console.log(`2. Compare how each provider renders the links`);
  console.log(`3. Right-click links and check the actual URLs`);
  console.log(`4. Choose the provider that best fits your needs`);
  console.log('═'.repeat(70));
}

runComparison().catch(console.error);
