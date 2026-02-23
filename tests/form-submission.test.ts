/**
 * E2E Test: User Form Submission Flow
 * Tests the complete flow from form submission to database record creation
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api`;

interface TestRequest {
  service_type: 'school' | 'medical' | 'wedding';
  pickup_address: string;
  dropoff_address: string;
  pickup_fuzzy: string;
  dropoff_fuzzy: string;
  start_date: string;
  start_time?: string;
  is_recurring: boolean;
  metadata: Record<string, any>;
}

// Test data for each service type
const testRequests: Record<string, TestRequest> = {
  school: {
    service_type: 'school',
    pickup_address: '123 Oak Street, Boston, MA 02101',
    dropoff_address: 'Boston Latin School, Boston, MA 02115',
    pickup_fuzzy: '123 Oak St, Boston',
    dropoff_fuzzy: 'Boston Latin School',
    start_date: '2026-02-01',
    start_time: '07:45',
    is_recurring: true,
    metadata: {
      school_name: 'Boston Latin School',
      grade_level: 'high',
      student_count: 2,
      schedule_type: 'round-trip',
      am_pickup_time: '07:45',
      pm_pickup_time: '15:00',
      duration_type: 'daily',
    }
  },
  medical: {
    service_type: 'medical',
    pickup_address: '456 Main Street, Cambridge, MA 02139',
    dropoff_address: 'Massachusetts General Hospital, Boston, MA 02114',
    pickup_fuzzy: '456 Main St, Cambridge',
    dropoff_fuzzy: 'Mass General Hospital',
    start_date: '2026-02-15',
    start_time: '09:30',
    is_recurring: false,
    metadata: {
      patient_name: 'Test Patient',
      mobility_level: 'wheelchair',
      service_level: 'door-to-door',
      trip_type: 'one-way',
      appointment_time: '09:30',
    }
  },
  wedding: {
    service_type: 'wedding',
    pickup_address: 'Marriott Hotel, Boston, MA 02116',
    dropoff_address: 'Liberty Hotel, Boston, MA 02114',
    pickup_fuzzy: 'Marriott Hotel, Boston',
    dropoff_fuzzy: 'Liberty Hotel, Boston',
    start_date: '2026-06-20',
    start_time: '16:00',
    is_recurring: false,
    metadata: {
      guest_count: 50,
      vehicle_style: 'shuttle',
      itinerary_type: 'hotel-to-venue',
      pickup_time: '16:00',
      contact_name: 'Jane Smith',
      contact_phone: '617-555-0123',
      contact_email: 'jane@example.com',
    }
  }
};

/**
 * Test API endpoint directly
 */
async function testAPISubmission(serviceType: keyof typeof testRequests): Promise<boolean> {
  console.log(`\n🧪 Testing ${serviceType} service submission...`);
  
  const requestData = testRequests[serviceType];
  
  try {
    const response = await fetch(`${API_URL}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ API Error (${response.status}):`, data.error);
      return false;
    }

    // Verify response structure
    if (!data.success || !data.request) {
      console.error('❌ Invalid response structure:', data);
      return false;
    }

    const request = data.request;

    // Verify all required fields
    const checks = [
      { field: 'id', value: request.id, test: (v: any) => !!v, desc: 'Request ID exists' },
      { field: 'service_type', value: request.service_type, test: (v: any) => v === serviceType, desc: `Service type is ${serviceType}` },
      { field: 'pickup_address', value: request.pickup_address, test: (v: any) => v === requestData.pickup_address, desc: 'Pickup address matches' },
      { field: 'dropoff_address', value: request.dropoff_address, test: (v: any) => v === requestData.dropoff_address, desc: 'Dropoff address matches' },
      { field: 'start_date', value: request.start_date, test: (v: any) => v === requestData.start_date, desc: 'Start date matches' },
      { field: 'status', value: request.status, test: (v: any) => v === 'pending', desc: 'Status is pending' },
      { field: 'metadata', value: request.metadata, test: (v: any) => !!v && typeof v === 'object', desc: 'Metadata exists' },
      { field: 'created_at', value: request.created_at, test: (v: any) => !!v, desc: 'Created timestamp exists' },
    ];

    let allPassed = true;
    for (const check of checks) {
      const passed = check.test(check.value);
      const icon = passed ? '✅' : '❌';
      console.log(`  ${icon} ${check.desc}`);
      if (!passed) {
        console.log(`     Expected: ${JSON.stringify(check.value)}`);
        allPassed = false;
      }
    }

    if (allPassed) {
      console.log(`\n✅ ${serviceType.toUpperCase()} request created successfully!`);
      console.log(`   Request ID: ${request.id}`);
      return true;
    } else {
      console.log(`\n❌ Some checks failed for ${serviceType}`);
      return false;
    }

  } catch (error: any) {
    console.error(`❌ Error testing ${serviceType}:`, error.message);
    return false;
  }
}

/**
 * Test validation - should reject invalid data
 */
async function testValidation(): Promise<boolean> {
  console.log('\n🧪 Testing validation (should reject invalid data)...');
  
  const invalidData = {
    service_type: 'school',
    pickup_address: '', // Empty - should fail
    dropoff_address: '', // Empty - should fail
    start_date: '', // Empty - should fail
  };

  try {
    const response = await fetch(`${API_URL}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invalidData),
    });

    if (response.status === 400) {
      console.log('✅ Validation correctly rejected invalid data');
      return true;
    } else {
      console.log('❌ Validation should have rejected invalid data');
      return false;
    }
  } catch (error: any) {
    console.error('❌ Error testing validation:', error.message);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Starting E2E Form Submission Tests');
  console.log('=====================================');
  console.log(`API URL: ${API_URL}`);
  console.log('');

  const results: Record<string, boolean> = {};

  // Test each service type
  results['school'] = await testAPISubmission('school');
  await new Promise(resolve => setTimeout(resolve, 500));
  
  results['medical'] = await testAPISubmission('medical');
  await new Promise(resolve => setTimeout(resolve, 500));
  
  results['wedding'] = await testAPISubmission('wedding');
  await new Promise(resolve => setTimeout(resolve, 500));
  
  results['validation'] = await testValidation();

  // Print summary
  console.log('\n\n📊 Test Summary');
  console.log('=====================================');
  
  const total = Object.keys(results).length;
  const passed = Object.values(results).filter(r => r).length;
  const failed = total - passed;

  Object.entries(results).forEach(([test, passed]) => {
    const icon = passed ? '✅' : '❌';
    const status = passed ? 'PASSED' : 'FAILED';
    console.log(`${icon} ${test.padEnd(20)} ${status}`);
  });

  console.log('\n────────────────────────────────────');
  console.log(`Total:  ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('────────────────────────────────────');

  if (failed === 0) {
    console.log('\n🎉 All tests passed! Form submission flow is working correctly.\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
