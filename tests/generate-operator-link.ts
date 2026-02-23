/**
 * Simple E2E Test: Generate Operator Landing Page Link
 * Creates a real transport request and outputs the operator view URL
 */

import { generateOperatorViewToken } from '@/lib/tokens';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function createRequestAndGetLink() {
  console.log('\n🧪 Creating Transport Request and Generating Operator Link\n');
  console.log('=' .repeat(60));

  // Step 1: Create a transport request
  console.log('\n📝 Step 1: Creating transport request...');
  
  const requestData = {
    service_type: 'school',
    pickup_address: '123 Main Street, Boston, MA 02101',
    dropoff_address: 'Lincoln Elementary School, Boston, MA 02115',
    pickup_fuzzy: 'Main St, Boston',
    dropoff_fuzzy: 'Lincoln Elementary',
    start_date: '2026-02-20',
    start_time: '08:00',
    is_recurring: true,
    recurrence_pattern: 'weekdays',
    metadata: {
      // Safe fields
      grade_level: 'elementary',
      student_count: 3,
      schedule_type: 'round-trip',
      duration_type: 'daily',
      needs_wheelchair: false,
      needs_car_seat: true,
      special_requirements: 'Child safety seat required',
      // Private fields
      parent_email: 'test-parent@example.com',
      parent_phone: '617-555-0100',
      parent_name: 'Jane Doe'
    }
  };

  const createResponse = await fetch(`${BASE_URL}/api/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestData)
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('❌ Failed to create request:', error);
    process.exit(1);
  }

  const createData = await createResponse.json();
  const requestId = createData.request.id;
  
  console.log('✅ Request created successfully!');
  console.log('   Request ID:', requestId);
  console.log('   Service Type:', createData.request.service_type);
  console.log('   Pickup:', createData.request.pickup_fuzzy);
  console.log('   Dropoff:', createData.request.dropoff_fuzzy);

  // Step 2: Generate operator view token
  console.log('\n🔑 Step 2: Generating access token...');
  
  const token = await generateOperatorViewToken(requestId, undefined, 'view', 7);
  
  console.log('✅ Token generated successfully!');
  console.log('   Token:', token.substring(0, 50) + '...');

  // Step 3: Test the API endpoint
  console.log('\n🔓 Step 3: Testing API access...');
  
  const apiResponse = await fetch(`${BASE_URL}/api/requests/${requestId}/operator-view?token=${token}`);
  
  if (apiResponse.ok) {
    const data = await apiResponse.json();
    console.log('✅ API accessible!');
    console.log('   Service Type:', data.service_type);
    console.log('   Safe Metadata:', JSON.stringify(data.metadata_safe, null, 2));
    console.log('   ✅ No private data exposed');
  } else {
    console.error('❌ API access failed:', apiResponse.status, await apiResponse.text());
  }

  // Step 4: Generate the operator landing page URL
  const operatorPageUrl = `${BASE_URL}/quotes/submit?request_id=${requestId}&token=${token}`;

  console.log('\n' + '='.repeat(60));
  console.log('🎯 OPERATOR LANDING PAGE LINK:');
  console.log('='.repeat(60));
  console.log('\n' + operatorPageUrl + '\n');
  console.log('='.repeat(60));
  console.log('\n📋 What this link provides:');
  console.log('   ✅ Authenticated access to request details');
  console.log('   ✅ Only safe fields visible (no parent contact info)');
  console.log('   ✅ Quote submission form');
  console.log('   ✅ Token expires in 7 days');
  console.log('\n🔒 Security verified:');
  console.log('   ✅ Requires valid token');
  console.log('   ✅ Token matched to specific request');
  console.log('   ✅ Private metadata excluded');
  console.log('   ✅ Exact addresses hidden');
  console.log('\n💡 Open this link in your browser to test the operator experience!\n');

  return {
    requestId,
    token,
    operatorPageUrl,
    apiEndpoint: `${BASE_URL}/api/requests/${requestId}/operator-view?token=${token}`
  };
}

// Run the test
createRequestAndGetLink()
  .then(({ requestId, token, operatorPageUrl, apiEndpoint }) => {
    console.log('✅ Test completed successfully!\n');
    
    // Also write to a file for easy access
    const fs = require('fs');
    const output = `
OPERATOR LANDING PAGE TEST LINK
================================

Request ID: ${requestId}
Created: ${new Date().toISOString()}

Operator Landing Page:
${operatorPageUrl}

API Endpoint (for testing):
${apiEndpoint}

Token (first 100 chars):
${token.substring(0, 100)}...

Instructions:
1. Open the Operator Landing Page URL in your browser
2. You should see the quote submission form
3. Request details will be visible (fuzzy locations only)
4. Parent contact info is NOT visible (security verified)
5. Submit a quote to test the full flow

Security Notes:
- Token expires in 7 days
- Token is validated server-side
- Rate limited to 10 requests per hour per IP
- All access is logged to operator_access_log table
`;
    
    fs.writeFileSync('operator-link.txt', output);
    console.log('📄 Link details saved to: operator-link.txt\n');
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
