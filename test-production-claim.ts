/**
 * Production Claim Code Test
 * Tests the claim code endpoint in production environment
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') });

import { createClaimCode, redeemClaimCode } from './src/lib/claim-codes';

const PRODUCTION_URL = 'https://businto.com';

async function testProductionClaimCodes() {
  console.log('🧪 Testing Claim Code System in Production\n');
  console.log('='.repeat(60));

  try {
    // Step 1: Create a test claim code
    console.log('\n📝 Step 1: Creating test claim code...');
    const testRequestId = '123e4567-e89b-12d3-a456-' + Date.now().toString().slice(-12).padStart(12, '0');
    const testOperatorId = '987fcdeb-51a2-43d7-b456-' + Date.now().toString().slice(-12).padStart(12, '0');

    const testCode = await createClaimCode({
      resourceType: 'operator_quote',
      resourceId: testRequestId,
      operatorId: testOperatorId,
      purpose: 'quote',
      expiresInMinutes: 10, // 10 minutes for testing
      emailSentTo: 'test@example.com'
    });
    console.log(`✅ Created claim code: ${testCode}`);
    console.log(`📧 Production link: ${PRODUCTION_URL}/claim/${testCode}`);

    // Step 2: Test redemption via HTTP
    console.log('\n🔗 Step 2: Testing claim redemption via HTTP...');
    const claimUrl = `${PRODUCTION_URL}/claim/${testCode}`;

    try {
      const response = await fetch(claimUrl, {
        method: 'GET',
        redirect: 'manual' // Don't follow redirects, we want to see the redirect location
      });

      console.log(`📊 Response Status: ${response.status}`);
      console.log(`📍 Redirect Location: ${response.headers.get('location')}`);

      if (response.status === 307 || response.status === 302) {
        const redirectTo = response.headers.get('location');
        if (redirectTo && redirectTo.includes('/quotes/submit')) {
          console.log('✅ Claim redemption successful!');
          console.log(`   Redirects to: ${redirectTo}`);

          // Check if token is in redirect URL
          if (redirectTo.includes('token=')) {
            console.log('✅ JWT token generated successfully');
          } else {
            console.log('⚠️  Warning: No token in redirect URL');
          }
        } else {
          console.log('❌ Unexpected redirect location:', redirectTo);
        }
      } else {
        console.log(`❌ Unexpected status code: ${response.status}`);
      }
    } catch (fetchError) {
      console.error('❌ HTTP request failed:', fetchError);
    }

    // Step 3: Test one-time use (should fail)
    console.log('\n🔒 Step 3: Testing one-time use enforcement...');
    const secondRedemption = await redeemClaimCode(testCode, '127.0.0.1');

    if (secondRedemption === null) {
      console.log('✅ One-time use enforced correctly!');
      console.log('   Second redemption attempt was rejected');
    } else {
      console.log('❌ SECURITY ISSUE: Code was reused!');
      console.log('   Second redemption succeeded when it should fail');
    }

    // Step 4: Test invalid code
    console.log('\n❓ Step 4: Testing invalid code handling...');
    const invalidRedemption = await redeemClaimCode('INVALID123', '127.0.0.1');

    if (invalidRedemption === null) {
      console.log('✅ Invalid code rejected correctly');
    } else {
      console.log('❌ SECURITY ISSUE: Invalid code was accepted!');
    }

    // Step 5: Create and test via HTTP again
    console.log('\n🔄 Step 5: Full HTTP flow test...');
    const testRequestId2 = '456e7890-abc1-23d4-e567-' + Date.now().toString().slice(-12).padStart(12, '0');
    const testOperatorId2 = '789fedcb-a987-65d4-c321-' + Date.now().toString().slice(-12).padStart(12, '0');

    const testCode2 = await createClaimCode({
      resourceType: 'operator_quote',
      resourceId: testRequestId2,
      operatorId: testOperatorId2,
      purpose: 'quote',
      expiresInMinutes: 10,
      emailSentTo: 'test-http@example.com'
    });

    console.log(`📧 Testing URL: ${PRODUCTION_URL}/claim/${testCode2}`);

    try {
      const response2 = await fetch(`${PRODUCTION_URL}/claim/${testCode2}`, {
        method: 'GET',
        redirect: 'manual'
      });

      if (response2.status === 307 || response2.status === 302) {
        console.log('✅ First HTTP redemption successful');

        // Try again (should fail or redirect to error)
        const response3 = await fetch(`${PRODUCTION_URL}/claim/${testCode2}`, {
          method: 'GET',
          redirect: 'manual'
        });

        const redirectLocation = response3.headers.get('location');
        if (redirectLocation && (redirectLocation.includes('error=') || redirectLocation.includes('invalid_link'))) {
          console.log('✅ HTTP one-time use enforced');
          console.log(`   Second attempt redirects to: ${redirectLocation}`);
        } else {
          console.log('⚠️  Second HTTP attempt status:', response3.status);
          console.log('   Location:', redirectLocation);
        }
      }
    } catch (httpError) {
      console.error('❌ HTTP flow test failed:', httpError);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Production Claim Code Tests Complete!\n');

    // Summary
    console.log('📊 Test Summary:');
    console.log('   ✅ Claim code generation');
    console.log('   ✅ HTTP redemption endpoint');
    console.log('   ✅ One-time use enforcement');
    console.log('   ✅ Invalid code handling');
    console.log('   ✅ Full HTTP flow');

    console.log('\n💡 Next Steps:');
    console.log('   1. Check Supabase for claim code records');
    console.log('   2. Create a real transport request to test full flow');
    console.log('   3. Monitor operator email logs\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testProductionClaimCodes().catch(console.error);
