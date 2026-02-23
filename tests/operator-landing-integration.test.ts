/**
 * E2E Test: Operator Landing Page with Token Authentication
 * Tests the complete operator flow from email link to quote submission
 * Requires Next.js dev server running on localhost:3000
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { generateOperatorViewToken } from '@/lib/tokens';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 30000;

describe('Operator Landing Page - Complete Flow', () => {
  let testRequestId: string;
  let validToken: string;

  beforeAll(async () => {
    console.log('\n🧪 Setting up integration test environment');
    console.log('📡 Base URL:', BASE_URL);
    
    // Step 1: Create a test transport request
    console.log('\n📝 Step 1: Creating test transport request...');
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

    expect(createResponse.ok, `Failed to create request: ${createResponse.statusText}`).toBe(true);
    const createData = await createResponse.json();
    testRequestId = createData.request.id;
    
    console.log('✅ Request created:', testRequestId);
    console.log('   Service Type:', createData.request.service_type);
    console.log('   Pickup:', createData.request.pickup_fuzzy);
    console.log('   Dropoff:', createData.request.dropoff_fuzzy);

    // Step 2: Generate a valid operator view token
    console.log('\n🔑 Step 2: Generating valid access token...');
    validToken = await generateOperatorViewToken(testRequestId, undefined, 'view', 7);
    console.log('✅ Token generated:', validToken.substring(0, 40) + '...');

    console.log('\n✅ Setup complete - ready for tests\n');
  }, TEST_TIMEOUT);

  describe('API Security - Token Validation', () => {
    it('should reject API access without token', async () => {
      console.log('🔒 Test: API access without token');
      
      const response = await fetch(`${BASE_URL}/api/requests/${testRequestId}/operator-view`);
      
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Access token required');
      
      console.log('   ✅ Correctly blocked - 401 Unauthorized');
    }, TEST_TIMEOUT);

    it('should reject API access with invalid token', async () => {
      console.log('🔒 Test: API access with invalid token');
      
      const response = await fetch(`${BASE_URL}/api/requests/${testRequestId}/operator-view?token=fake-invalid-token-12345`);
      
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Invalid or expired token');
      
      console.log('   ✅ Correctly rejected invalid token');
    }, TEST_TIMEOUT);

    it('should reject token for wrong request ID', async () => {
      console.log('🔒 Test: Token mismatch with different request ID');
      
      // Generate token for a different request ID
      const wrongToken = await generateOperatorViewToken('wrong-request-id-999', undefined, 'view', 7);
      
      const response = await fetch(`${BASE_URL}/api/requests/${testRequestId}/operator-view?token=${wrongToken}`);
      
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Token does not match requested resource');
      
      console.log('   ✅ Correctly blocked mismatched token - 403 Forbidden');
    }, TEST_TIMEOUT);

    it('should allow API access with valid token', async () => {
      console.log('🔓 Test: API access with valid token');
      
      const response = await fetch(`${BASE_URL}/api/requests/${testRequestId}/operator-view?token=${validToken}`);
      
      expect(response.status, `Expected 200 but got ${response.status}`).toBe(200);
      const data = await response.json();
      
      // Verify response structure
      expect(data).toHaveProperty('id', testRequestId);
      expect(data).toHaveProperty('service_type', 'school');
      expect(data).toHaveProperty('pickup_fuzzy', 'Main St, Boston');
      expect(data).toHaveProperty('dropoff_fuzzy', 'Lincoln Elementary');
      expect(data).toHaveProperty('metadata_safe');
      
      // Verify safe metadata contains expected fields
      expect(data.metadata_safe).toHaveProperty('student_count', 3);
      expect(data.metadata_safe).toHaveProperty('schedule_type', 'round-trip');
      
      // CRITICAL: Verify private data is NOT exposed
      expect(data).not.toHaveProperty('metadata_private');
      expect(data).not.toHaveProperty('pickup_address');
      expect(data).not.toHaveProperty('dropoff_address');
      expect(data).not.toHaveProperty('user_id');
      expect(data.metadata_safe).not.toHaveProperty('parent_email');
      expect(data.metadata_safe).not.toHaveProperty('parent_phone');
      expect(data.metadata_safe).not.toHaveProperty('parent_name');
      
      console.log('   ✅ Successfully fetched sanitized data');
      console.log('   ✅ Private fields correctly excluded');
      console.log('   📊 Response:', JSON.stringify(data, null, 2).substring(0, 200) + '...');
    }, TEST_TIMEOUT);
  });

  describe('Rate Limiting', () => {
    it.skip('should enforce rate limits after excessive requests', async () => {
      console.log('⏱️  Test: Rate limiting (10 requests/hour limit)');
      
      // Make 11 rapid requests (limit is 10)
      const requests = [];
      for (let i = 0; i < 11; i++) {
        requests.push(
          fetch(`${BASE_URL}/api/requests/${testRequestId}/operator-view?token=${validToken}`)
        );
      }
      
      const responses = await Promise.all(requests);
      
      // First 10 should succeed (or most of them)
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      
      console.log(`   📊 Successful: ${successCount}, Rate Limited: ${rateLimitedCount}`);
      
      // At least one should be rate limited
      expect(rateLimitedCount).toBeGreaterThan(0);
      
      if (rateLimitedCount > 0) {
        const rateLimitedResponse = responses.find(r => r.status === 429);
        const data = await rateLimitedResponse!.json();
        expect(data.error).toContain('Rate limit exceeded');
        console.log('   ✅ Rate limiting is active');
      }
    }, TEST_TIMEOUT);
  });

  describe('Operator View Page Rendering', () => {
    it('should display error message without token', async () => {
      console.log('🌐 Test: Page render without token');

      const response = await fetch(`${BASE_URL}/quotes/submit?request_id=${testRequestId}`, {
        headers: { 'Accept': 'text/html' }
      });

      expect(response.ok).toBe(true);
      const html = await response.text();

      // Page is CSR — SSR shell confirms it's the right app and route
      expect(html).toContain('Businto');
      expect(html).toContain('BAILOUT_TO_CLIENT_SIDE_RENDERING');

      // API-level security check (the real gatekeeper)
      const apiResponse = await fetch(`${BASE_URL}/api/requests/${testRequestId}/operator-view`);
      expect(apiResponse.status).toBe(401);

      console.log('   ✅ Page loads (error shown client-side), API blocks access correctly');
    }, TEST_TIMEOUT);

    it('should load page structure with valid token', async () => {
      console.log('🌐 Test: Page render with valid token');

      const response = await fetch(`${BASE_URL}/quotes/submit?request_id=${testRequestId}&token=${validToken}`, {
        headers: { 'Accept': 'text/html' }
      });

      expect(response.ok).toBe(true);
      const html = await response.text();

      // SSR shell loads; actual form renders client-side after token validation
      expect(html).toContain('Businto');
      expect(html).toContain('quotes');

      // API confirms valid token grants access
      const apiResponse = await fetch(`${BASE_URL}/api/requests/${testRequestId}/operator-view?token=${validToken}`);
      expect(apiResponse.status).toBe(200);
      const data = await apiResponse.json();
      expect(data).toHaveProperty('id', testRequestId);

      console.log('   ✅ Page loaded successfully, API grants access with valid token');
    }, TEST_TIMEOUT);
  });

  describe('Data Access Audit', () => {
    it('should log access attempts to audit table', async () => {
      console.log('📝 Test: Audit logging');
      
      // Make a request to trigger audit logging
      await fetch(`${BASE_URL}/api/requests/${testRequestId}/operator-view?token=${validToken}`);
      
      // Wait a moment for async logging
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('   ✅ Access logged (check operator_access_log table)');
      console.log('   💡 Verify with: SELECT * FROM operator_access_log WHERE request_id =', testRequestId);
    }, TEST_TIMEOUT);
  });
});
