#!/usr/bin/env node

/**
 * Test script: Patient ride request from 3 Manning Ter, Everett, MA to Boston Medical Center
 */

const { createClient } = require('@supabase/supabase-js');

// Local Supabase credentials
const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseAnonKey = 'REMOVED_ANON_KEY';
const supabaseServiceKey = 'REMOVED_SERVICE_KEY';

// Use service role to bypass RLS for testing
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testPatientRideFlow() {
  console.log('🏥 Testing Patient Ride Request Flow');
  console.log('=' .repeat(60));
  console.log('');

  // Step 1: Create a test user (or use existing)
  console.log('📋 Step 1: Setting up test user...');
  
  const testUserId = '00000000-0000-0000-0000-000000000001';
  
  // Test user already created via SQL, skip profile creation
  console.log('✅ Using test user: John Patient');
  console.log('');
  
  // Step 2: Create transport request
  console.log('📋 Step 2: Creating patient transport request...');
  
  const requestData = {
    user_id: testUserId,
    service_type: 'medical',
    
    // Exact addresses (stored but hidden from operators initially)
    pickup_address: '3 Manning Ter, Everett, MA 02149',
    dropoff_address: 'Boston Medical Center, 1 Boston Medical Center Pl, Boston, MA 02118',
    
    // Fuzzy addresses (shown to operators for privacy)
    pickup_fuzzy: 'Manning Terrace area, Everett, MA',
    dropoff_fuzzy: 'Boston Medical Center, Boston, MA',
    
    // Coordinates (you'd normally get these from geocoding)
    pickup_lat: 42.4084,
    pickup_lng: -71.0537,
    dropoff_lat: 42.3356,
    dropoff_lng: -71.0723,
    
    // Trip details (calculated or estimated)
    distance_miles: 5.2,
    duration_mins: 18,
    
    // Schedule
    start_date: '2026-01-15',
    start_time: '09:30:00',
    is_recurring: false,
    
    // Medical-specific metadata
    metadata: {
      appointment_type: 'Dialysis Treatment',
      wheelchair_required: false,
      oxygen_required: false,
      special_needs: 'Patient needs assistance walking',
      insurance_provider: 'MassHealth',
      return_trip_needed: true,
      estimated_appointment_duration: 240 // 4 hours
    },
    
    status: 'pending'
  };

  const { data: request, error: requestError } = await supabase
    .from('transport_requests')
    .insert(requestData)
    .select()
    .single();

  if (requestError) {
    console.error('❌ Error creating request:', requestError);
    return;
  }

  console.log('✅ Transport request created!');
  console.log('   Request ID:', request.id);
  console.log('   From:', requestData.pickup_fuzzy);
  console.log('   To:', requestData.dropoff_fuzzy);
  console.log('   Distance:', requestData.distance_miles, 'miles');
  console.log('   Date:', requestData.start_date, 'at', requestData.start_time);
  console.log('');

  // Step 3: Find matching operators
  console.log('📋 Step 3: Finding matching medical transport operators...');
  
  const { data: operators, error: opError } = await supabase
    .from('operators')
    .select('id, company_name, vehicle_types, rating, base_rate_per_mile, minimum_charge, response_time_avg_mins')
    .contains('service_areas', ['MA'])
    .or('vehicle_types.cs.{van},vehicle_types.cs.{wheelchair_van}')
    .eq('is_active', true)
    .eq('is_accepting_requests', true)
    .order('rating', { ascending: false });

  if (opError) {
    console.error('❌ Error finding operators:', opError);
    return;
  }

  console.log(`✅ Found ${operators.length} matching operators:`);
  operators.forEach((op, idx) => {
    console.log(`   ${idx + 1}. ${op.company_name} - ⭐${op.rating}`);
  });
  console.log('');

  // Create operator map for later reference
  const operatorMap = {};

  // Step 4: Simulate operators submitting quotes
  console.log('📋 Step 4: Simulating operator quotes...');
  
  // Note: In production, operator_id should reference profiles table
  // For this test, we'll create mock profile entries for operators
  const quotesToCreate = [];
  
  for (let i = 0; i < Math.min(3, operators.length); i++) {
    const op = operators[i];
    
    // Create a mock profile for the operator (in production, this would exist)
    const mockOperatorUserId = `99999999-0000-0000-0000-00000000000${i + 1}`;
    
    // Insert operator profile
    try {
      await supabase.from('profiles').upsert({
        id: mockOperatorUserId,
        email: op.company_name.toLowerCase().replace(/\s+/g, '') + '@example.com',
        full_name: op.company_name,
        role: 'operator',
        company_name: op.company_name
      });
    } catch (e) {
      // Ignore if already exists
    }
    
    const basePrice = requestData.distance_miles * op.base_rate_per_mile;
    const finalPrice = Math.max(basePrice, op.minimum_charge);
    
    quotesToCreate.push({
      request_id: request.id,
      operator_id: mockOperatorUserId, // Use mock profile ID
      total_price: finalPrice.toFixed(2),
      base_fare: op.minimum_charge,
      distance_charge: (requestData.distance_miles * op.base_rate_per_mile).toFixed(2),
      vehicle_type: 'van',
      vehicle_capacity: 6,
      wheelchair_accessible: op.vehicle_types.includes('wheelchair_van'),
      note: 'We specialize in medical transport with trained staff.',
      response_time_mins: op.response_time_avg_mins,
      status: 'pending'
    });
    
    // Store operator details for later reference
    operatorMap[mockOperatorUserId] = op;
  }

  const { data: quotes, error: quotesError } = await supabase
    .from('quotes')
    .insert(quotesToCreate)
    .select();

  if (quotesError) {
    console.error('❌ Error creating quotes:', quotesError);
    return;
  }

  console.log(`✅ ${quotes.length} operators submitted quotes:`);
  quotes.forEach((quote, idx) => {
    const operator = operatorMap[quote.operator_id];
    console.log(`   ${idx + 1}. ${operator.company_name}`);
    console.log(`      Price: $${quote.total_price}`);
    console.log(`      Vehicle: ${quote.vehicle_type} (${quote.vehicle_capacity} passengers)`);
    console.log(`      Wheelchair: ${quote.wheelchair_accessible ? 'Yes' : 'No'}`);
    console.log(`      Response time: ~${quote.response_time_mins} mins`);
  });
  console.log('');

  // Step 5: User accepts best quote
  console.log('📋 Step 5: User accepts quote...');
  
  const selectedQuote = quotes[0]; // Select first quote (highest rated operator)
  
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      request_id: request.id,
      quote_id: selectedQuote.id,
      user_id: testUserId,
      operator_id: selectedQuote.operator_id,
      amount: selectedQuote.total_price,
      payment_status: 'pending',
      status: 'confirmed',
      special_instructions: 'Please call upon arrival. Patient may need assistance to vehicle.'
    })
    .select()
    .single();

  if (bookingError) {
    console.error('❌ Error creating booking:', bookingError);
    return;
  }

  const selectedOperator = operatorMap[selectedQuote.operator_id];
  
  console.log('✅ Booking confirmed!');
  console.log(`   Operator: ${selectedOperator.company_name}`);
  console.log(`   Amount: $${booking.amount}`);
  console.log(`   Confirmation Code: ${booking.confirmation_code}`);
  console.log('');

  // Step 6: Create notification
  console.log('📋 Step 6: Creating notification...');
  
  const { data: notification, error: notifError } = await supabase
    .from('notifications')
    .insert({
      user_id: testUserId,
      type: 'booking_confirmed',
      title: 'Ride Confirmed!',
      message: `Your medical transport with ${selectedOperator.company_name} is confirmed for January 15, 2026 at 9:30 AM.`,
      data: {
        booking_id: booking.id,
        confirmation_code: booking.confirmation_code,
        operator_name: selectedOperator.company_name
      }
    })
    .select()
    .single();

  if (!notifError) {
    console.log('✅ Notification created');
  }
  console.log('');

  // Summary
  console.log('=' .repeat(60));
  console.log('📊 FLOW SUMMARY');
  console.log('=' .repeat(60));
  console.log('✅ Request created:', request.id);
  console.log('✅ Operators notified:', operators.length);
  console.log('✅ Quotes received:', quotes.length);
  console.log('✅ Booking confirmed with:', selectedOperator.company_name);
  console.log('✅ Total price: $' + booking.amount);
  console.log('✅ Confirmation code:', booking.confirmation_code);
  console.log('');
  console.log('🎉 Test completed successfully!');
}

testPatientRideFlow().catch(console.error);
