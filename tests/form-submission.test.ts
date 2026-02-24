/**
 * E2E Test: User Form Submission Flow
 * Tests the complete flow from form submission to database record creation
 * Requires Next.js dev server running on localhost:3000
 */

import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api`;

async function isServerReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(3000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

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
    // The API returns privacy-scrubbed fuzzy address fields, not the raw input addresses.
    const checks = [
      { field: 'id', value: request.id, test: (v: any) => !!v, desc: 'Request ID exists' },
      { field: 'service_type', value: request.service_type, test: (v: any) => v === serviceType, desc: `Service type is ${serviceType}` },
      { field: 'pickup_fuzzy', value: request.pickup_fuzzy, test: (v: any) => typeof v === 'string' && v.length > 0, desc: 'Pickup fuzzy address exists' },
      { field: 'dropoff_fuzzy', value: request.dropoff_fuzzy, test: (v: any) => typeof v === 'string' && v.length > 0, desc: 'Dropoff fuzzy address exists' },
      { field: 'start_date', value: request.start_date, test: (v: any) => v === requestData.start_date, desc: 'Start date matches' },
      { field: 'status', value: request.status, test: (v: any) => v === 'pending', desc: 'Status is pending' },
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
 * Main test suite — wraps the helpers above in proper Vitest describe/it blocks.
 * All tests are skipped when no dev server is reachable.
 */
describe('E2E Form Submission Flow', () => {
  let serverAvailable = false;

  beforeAll(async () => {
    serverAvailable = await isServerReachable();
    if (!serverAvailable) {
      console.log('⏭️  No dev server running — skipping form submission E2E tests');
    }
  }, 10000);

  it('should submit a school service request successfully', async () => {
    if (!serverAvailable) return;
    const result = await testAPISubmission('school');
    expect(result).toBe(true);
  }, 15000);

  it('should submit a medical service request successfully', async () => {
    if (!serverAvailable) return;
    const result = await testAPISubmission('medical');
    expect(result).toBe(true);
  }, 15000);

  it('should submit a wedding service request successfully', async () => {
    if (!serverAvailable) return;
    const result = await testAPISubmission('wedding');
    expect(result).toBe(true);
  }, 15000);

  it('should reject requests with missing required fields', async () => {
    if (!serverAvailable) return;
    const result = await testValidation();
    expect(result).toBe(true);
  }, 15000);
});
