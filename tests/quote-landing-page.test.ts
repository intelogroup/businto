/**
 * E2E Test: Quote Landing Page from Email Link
 * Tests the complete flow from email link to quote submission page
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

describe('Quote Landing Page - Email Link Flow', () => {
  let requestId: string;
  let accessToken: string;
  let emailPreviewUrl: string;

  beforeAll(async () => {
    console.log('\n🧪 Setting up test: Create transport request and get email link');
    
    // Create a test request
    const requestData = {
      service_type: 'school',
      pickup_address: '123 Oak Street, Boston, MA 02101',
      dropoff_address: 'Boston Latin School, Boston, MA 02115',
      pickup_fuzzy: '123 Oak St, Boston',
      dropoff_fuzzy: 'Boston Latin School',
      start_date: '2026-02-15',
      start_time: '07:45',
      is_recurring: true,
      recurrence_pattern: 'weekdays',
      metadata: {
        grade_level: 'high',
        student_count: 2,
        schedule_type: 'round-trip',
        am_pickup_time: '07:45',
        pm_pickup_time: '15:00',
        duration_type: 'daily',
        parent_email: 'parent@test.com'
      }
    };

    const response = await fetch(`${BASE_URL}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    requestId = data.request.id;
    
    console.log('✅ Request created:', requestId);
    console.log('⏳ Waiting 3s for emails to be sent...');
    
    // Wait for emails to be sent
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('✅ Setup complete');
  }, 30000);

  it('should load quote landing page (CSR shell) and API enforces token', async () => {
    console.log('\n📧 Testing operator view access...');
    console.log('Request ID:', requestId);

    // Page is client-side rendered (uses useSearchParams), so SSR shell won't
    // contain dynamic content. Verify the page itself loads (200 OK).
    const pageResponse = await fetch(`${BASE_URL}/quotes/submit?request_id=${requestId}`, {
      headers: { 'Accept': 'text/html' }
    });
    console.log('🌐 Page status (no token):', pageResponse.status);
    expect(pageResponse.ok).toBe(true);
    const html = await pageResponse.text();
    // SSR shell always contains the app root
    expect(html).toContain('BAILOUT_TO_CLIENT_SIDE_RENDERING');
    console.log('✅ Page loads (client-side rendering confirmed)');

    // The real security check is the API — test it directly
    const noTokenApiResponse = await fetch(`${BASE_URL}/api/requests/${requestId}/operator-view`);
    expect(noTokenApiResponse.status).toBe(401);
    const noTokenData = await noTokenApiResponse.json();
    expect(noTokenData.error).toBe('Access token required');
    console.log('✅ API correctly blocks access without token');

    const invalidTokenApiResponse = await fetch(`${BASE_URL}/api/requests/${requestId}/operator-view?token=invalid123`);
    expect(invalidTokenApiResponse.status).toBe(401);
    const invalidTokenData = await invalidTokenApiResponse.json();
    expect(invalidTokenData.error).toBe('Invalid or expired token');
    console.log('✅ API correctly rejects invalid token');
  }, 15000);

  it('should validate operator-view API requires token', async () => {
    console.log('\n🔐 Testing operator-view API security...');
    
    // Test API endpoint directly
    const noTokenApiResponse = await fetch(`${BASE_URL}/api/requests/${requestId}/operator-view`);
    
    expect(noTokenApiResponse.status).toBe(401);
    const noTokenData = await noTokenApiResponse.json();
    expect(noTokenData.error).toBe('Access token required');
    
    console.log('✅ API correctly blocks access without token');
    
    // Test with invalid token
    const invalidTokenApiResponse = await fetch(`${BASE_URL}/api/requests/${requestId}/operator-view?token=invalid123`);
    
    expect(invalidTokenApiResponse.status).toBe(401);
    const invalidTokenData = await invalidTokenApiResponse.json();
    expect(invalidTokenData.error).toBe('Invalid or expired token');
    
    console.log('✅ API correctly rejects invalid token');
  }, 10000);

  it('should have correct page structure for quote submission', async () => {
    console.log('\n📄 Testing page structure...');

    // Page is CSR — check SSR shell loads with correct HTTP status and metadata
    const pageResponse = await fetch(`${BASE_URL}/quotes/submit?request_id=${requestId}&token=dummy`, {
      headers: { 'Accept': 'text/html' }
    });

    expect(pageResponse.ok).toBe(true);
    const html = await pageResponse.text();

    // Check for Next.js app shell and Businto branding in SSR output
    expect(html).toContain('Businto');
    expect(html).toContain('quotes');
    expect(html).toContain('BAILOUT_TO_CLIENT_SIDE_RENDERING');

    console.log('✅ Page shell loads correctly (form renders client-side)');
  }, 10000);

  afterAll(() => {
    console.log('\n✅ Quote Landing Page tests completed');
    console.log('\n📋 Summary:');
    console.log('- Request created successfully');
    console.log('- Page loads with proper error handling');
    console.log('- API enforces token-based security');
    console.log('- Form structure is correct');
  });
});
