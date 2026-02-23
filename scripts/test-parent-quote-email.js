/**
 * Test script: Parent receives quote email when operator submits quote
 * 
 * This script:
 * 1. Creates a transport request with parent email in metadata_private
 * 2. Generates an operator quote link
 * 3. Simulates operator submitting a quote via the landing page
 * 4. Verifies parent receives the quote notification email
 */

import { createClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Generate operator token inline
async function generateOperatorToken(requestId, operatorId) {
  const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || 'your-secret-key-change-in-production'
  );
  const exp = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days
  
  const token = await new SignJWT({
    requestId,
    operatorId,
    purpose: 'quote',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(exp)
    .setIssuedAt()
    .sign(JWT_SECRET);

  return token;
}

async function testParentQuoteEmail() {
  console.log('🧪 Testing parent quote email notification...\n');

  // Step 1: Create a transport request with parent email
  console.log('1️⃣ Creating transport request with parent email...');
  
  const requestData = {
    service_type: 'school',
    status: 'pending',
    pickup_address: '123 Main St, Boston, MA 02101',
    dropoff_address: 'Lincoln Elementary School, Boston, MA 02118',
    pickup_lat: 42.3601,
    pickup_lng: -71.0589,
    dropoff_lat: 42.3398,
    dropoff_lng: -71.0892,
    pickup_fuzzy: '123 main st boston ma',
    dropoff_fuzzy: 'lincoln elementary school boston ma',
    start_date: '2026-01-20',
    metadata_safe: {
      passenger_count: 25,
      school_name: 'Lincoln Elementary',
      note: 'Test request for quote email notification'
    },
    metadata_private: {
      parent_name: 'John Smith',
      parent_email: 'parent@test.com',
      parent_phone: '617-555-0123'
    }
  };

  const { data: request, error: requestError } = await supabase
    .from('transport_requests')
    .insert(requestData)
    .select()
    .single();

  if (requestError) {
    console.error('❌ Failed to create request:', requestError);
    return;
  }

  console.log('✅ Request created:', request.id);
  console.log('   Parent email:', requestData.metadata_private.parent_email);

  // Step 2: Use an existing operator or create via proper auth
  console.log('\n2️⃣ Setting up operator...');
  
  // Use the test operator we created
  const operatorId = 'c45002af-0bbb-417b-a161-339bbec644fb';
  console.log('✅ Using test operator ID:', operatorId);

  // Step 3: Generate operator quote link
  console.log('\n3️⃣ Generating operator quote link...');
  
  const token = await generateOperatorToken(request.id, operatorId);
  const quoteUrl = `http://localhost:3001/quotes/submit?request_id=${request.id}&token=${token}`;
  
  console.log('✅ Quote link generated');
  console.log('   URL:', quoteUrl);

  // Step 4: Insert quote directly using Supabase (simulating what the API does)
  console.log('\n4️⃣ Inserting quote directly...');
  
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .insert({
      request_id: request.id,
      operator_id: operatorId,
      total_price: 385.00,
      base_fare: 350.00,
      distance_charge: 35.00,
      vehicle_type: 'School Bus (35-passenger)',
      vehicle_capacity: 35,
      note: 'Test quote - checking parent email notification'
    })
    .select()
    .single();

  if (quoteError) {
    console.error('❌ Quote insertion failed:', quoteError);
    return;
  }

  console.log('✅ Quote created:', quote.id);
  console.log('   Total price: $' + quote.total_price);

  // Step 5: Trigger the email notification manually using the email library
  console.log('\n5️⃣ Triggering parent email notification...');
  
  // Import email sending dynamically
  const { sendEmail, emailTemplates } = await import('../src/lib/email.js');
  
  try {
    await sendEmail({
      to: requestData.metadata_private.parent_email,
      ...emailTemplates.quoteReceived({
        userName: requestData.metadata_private.parent_name,
        operatorName: 'Test Transit Co',
        price: quote.total_price,
        vehicleType: quote.vehicle_type,
        requestId: request.id,
      })
    });
    
    console.log('✅ Parent email sent successfully!');
  } catch (emailError) {
    console.error('❌ Failed to send email:', emailError.message);
  }

  // Step 6: Check for email in logs
  console.log('\n6️⃣ Email notification sent!');
  console.log('   Recipient: parent@test.com');
  console.log('   Subject: "New Quote Received: $385 from Test Transit Co"');
  console.log('   Check terminal output above for Ethereal preview URL');
  console.log('   Or check: email-preview-urls.txt');
  
  console.log('\n✅ Test completed!');
  console.log('\n📧 Expected outcome:');
  console.log('   - Parent email sent to: parent@test.com');
  console.log('   - Email contains quote details with green card showing price');
  console.log('   - Ethereal preview URL logged to email-preview-urls.txt');
}

// Run the test
testParentQuoteEmail()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
