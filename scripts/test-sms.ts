import { sendSMS } from '../src/lib/sms';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function runTest() {
  const testNumber = '8574261739';
  console.log(`🚀 Sending test SMS to ${testNumber}...`);

  const result = await sendSMS({
    to: testNumber,
    content: '[Businto] This is a test message to verify Brevo SMS integration. Welcome to the platform!',
    tag: 'test_sms'
  });

  if (result.success) {
    console.log('✅ Success! Message ID:', result.messageId);
    if (result.messageId === 'local-test-id') {
      console.log('ℹ️  Note: This was a LOCAL FALLBACK test. Check sms-preview-log.txt');
    }
  } else {
    console.error('❌ Failed to send SMS:', result.error);
  }
}

runTest().catch(console.error);
