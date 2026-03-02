/**
 * Quick test script for claim code system
 * Run: npx ts-node test-claim-codes.ts
 */

import { createClaimCode, redeemClaimCode } from './src/lib/claim-codes';

async function testClaimCodes() {
  console.log('🧪 Testing Claim Code System...\n');

  try {
    // Test 1: Create a claim code
    console.log('1️⃣ Creating claim code...');
    const code = await createClaimCode({
      resourceType: 'operator_quote',
      resourceId: 'test-request-123',
      operatorId: 'test-operator-456',
      purpose: 'quote',
      expiresInMinutes: 10080, // 7 days
      emailSentTo: 'test@example.com'
    });
    console.log(`   ✅ Created code: ${code}`);
    console.log(`   📧 Email link: https://businto.com/claim/${code}\n`);

    // Test 2: Redeem the claim code
    console.log('2️⃣ Redeeming claim code...');
    const redemption = await redeemClaimCode(code, '127.0.0.1');

    if (redemption) {
      console.log('   ✅ Redemption successful!');
      console.log('   📦 Resource Type:', redemption.resourceType);
      console.log('   🆔 Resource ID:', redemption.resourceId);
      console.log('   👤 Operator ID:', redemption.operatorId);
      console.log('   🎯 Purpose:', redemption.purpose);
    } else {
      console.log('   ❌ Redemption failed!');
    }

    // Test 3: Try to redeem again (should fail - one-time use)
    console.log('\n3️⃣ Attempting to redeem same code again (should fail)...');
    const secondRedemption = await redeemClaimCode(code, '127.0.0.1');

    if (secondRedemption) {
      console.log('   ❌ ERROR: Code was redeemed twice! Security issue!');
    } else {
      console.log('   ✅ Correctly rejected - one-time use enforced');
    }

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

testClaimCodes();
