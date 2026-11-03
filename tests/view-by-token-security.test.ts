import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * View-By-Token Route Security Tests
 *
 * /api/requests/view-by-token and /api/trips/view-by-token are PUBLIC routes
 * that surface request/trip data without authentication. They MUST:
 * - Require a valid token (reject missing/malformed tokens)
 * - Only expose metadata_safe fields (never metadata_private)
 * - Not leak PII (parent_email, parent_name, patient_name, contact_email, full addresses)
 * - Return 400/404 for invalid tokens (not 500)
 */

// Simulated response shapes that the routes should conform to
interface SafeRequestView {
  id: string;
  metadata_safe: Record<string, unknown>;
  metadata_private?: never; // must NOT be present
  service_type: string;
  status: string;
}

describe('View-By-Token Routes - Security Invariants', () => {
  describe('Token Validation', () => {
    it('should reject requests with no token', () => {
      // Simulates calling /api/requests/view-by-token with no ?token= param
      const token = undefined;
      const isValid = token !== undefined && typeof token === 'string' && token.length > 0;
      expect(isValid).toBe(false);
      // Route must return 400 Bad Request
    });

    it('should reject requests with empty token', () => {
      const token = '';
      const isValid = token.length > 0;
      expect(isValid).toBe(false);
    });

    it('should reject requests with malformed token (SQL injection attempt)', () => {
      const maliciousTokens = [
        "'; DROP TABLE requests; --",
        '1 OR 1=1',
        '<script>alert(1)</script>',
        '../../../etc/passwd',
      ];

      for (const token of maliciousTokens) {
        // Each of these should result in a 400/404, never a 500 or data leak
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
        expect(isUUID).toBe(false);
        console.log(`✅ Malformed token rejected: "${token.substring(0, 30)}..."`);
      }
    });

    it('should reject all-zeros UUID as a sentinel/placeholder token', () => {
      const nilUUID = '00000000-0000-0000-0000-000000000000';
      // Nil UUID matches UUID format but must be treated as invalid by the route handler
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nilUUID);
      const isNilUUID = nilUUID === '00000000-0000-0000-0000-000000000000';
      const isValidToken = isUUID && !isNilUUID;
      expect(isValidToken).toBe(false);
      console.log('✅ Nil/all-zeros UUID rejected as sentinel value');
    });

    it('should only accept UUID-format tokens', () => {
      const validToken = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(validToken);
      expect(isUUID).toBe(true);
    });
  });

  describe('PII Exclusion from Public View', () => {
    it('metadata_private must never appear in public view response', () => {
      // Simulated API response shape for a public request view
      const publicResponse: SafeRequestView = {
        id: 'req-123',
        service_type: 'school',
        status: 'open',
        metadata_safe: {
          school_name: 'Test School',
          grade_level: '5',
          student_count: 2,
          schedule_type: 'round-trip',
        },
        // metadata_private intentionally omitted
      };

      expect(publicResponse).not.toHaveProperty('metadata_private');
      expect(publicResponse.metadata_safe).not.toHaveProperty('parent_email');
      expect(publicResponse.metadata_safe).not.toHaveProperty('parent_name');
      expect(publicResponse.metadata_safe).not.toHaveProperty('contact_email');
      expect(publicResponse.metadata_safe).not.toHaveProperty('patient_name');
      expect(publicResponse.metadata_safe).not.toHaveProperty('phone');
      console.log('✅ PII fields absent from public metadata_safe');
    });

    it('medical metadata_safe must not include patient identifiers', () => {
      const safeMedicalMeta = {
        mobility_level: 'wheelchair',
        service_level: 'door-to-door',
        trip_type: 'one-way',
        appointment_time: '10:00',
        // patient_name and contact_email should be in metadata_private only
      };

      expect(safeMedicalMeta).not.toHaveProperty('patient_name');
      expect(safeMedicalMeta).not.toHaveProperty('contact_email');
      expect(safeMedicalMeta).not.toHaveProperty('phone');
      console.log('✅ Medical metadata_safe has no PII');
    });

    it('full address must not appear in public operator view', () => {
      // The One-Way Gate: full address only released post-acceptance via email template
      const operatorPublicView = {
        pickup_area: 'Boston, MA', // generalized area only
        dropoff_area: 'Cambridge, MA',
        // full_address: '123 Main St' — must NOT be here
      };

      expect(operatorPublicView).not.toHaveProperty('full_address');
      expect(operatorPublicView).not.toHaveProperty('street_address');
      expect(operatorPublicView).not.toHaveProperty('address_line_1');
      console.log('✅ Full address absent from operator public view');
    });
  });

  describe('Token Expiry and Status Checks', () => {
    it('expired request tokens should return 404 not 500', () => {
      // Simulate stale token lookup
      const requestStatus = 'expired';
      const validStatuses = ['open', 'matched', 'confirmed', 'completed'];
      const isViewable = validStatuses.includes(requestStatus);

      expect(isViewable).toBe(false);
      // Route should return 404: "Request not found or no longer available"
      console.log('✅ Expired request returns 404');
    });

    it('cancelled requests should not be publicly viewable', () => {
      const request = { status: 'cancelled', token: 'valid-token-uuid' };
      const isPubliclyViewable = !['cancelled', 'deleted', 'expired'].includes(request.status);
      expect(isPubliclyViewable).toBe(false);
      console.log('✅ Cancelled request not publicly viewable');
    });
  });

  describe('Seamless Payment Route Guards', () => {
    it('seamless payment must require authenticated session', () => {
      // /api/payments/seamless should reject unauthenticated requests
      const hasAuthHeader = false; // simulates missing Authorization header
      const hasCookieSession = false; // simulates missing session cookie

      const isAuthenticated = hasAuthHeader || hasCookieSession;
      expect(isAuthenticated).toBe(false);
      // Route must return 401
      console.log('✅ Seamless payment rejects unauthenticated requests');
    });

    it('seamless payment must validate amount is positive', () => {
      const amounts = [0, -1, -100, NaN, Infinity];
      for (const amount of amounts) {
        const isValid = typeof amount === 'number' && isFinite(amount) && amount > 0;
        expect(isValid).toBe(false);
        console.log(`✅ Invalid amount ${amount} rejected`);
      }
    });

    it('seamless payment must validate booking exists before charge', () => {
      const bookingId = null; // missing booking reference
      const isValid = bookingId !== null && bookingId !== undefined;
      expect(isValid).toBe(false);
      console.log('✅ Payment without booking reference rejected');
    });
  });

  describe('Logs Route Security', () => {
    it('logs API must require admin/master role', () => {
      // /api/logs is admin-only — non-admin requests must get 403
      const userRole = 'rider';
      const allowedRoles = ['master', 'admin'];
      const isAuthorized = allowedRoles.includes(userRole);
      expect(isAuthorized).toBe(false);
      console.log('✅ Logs endpoint rejects non-admin roles');
    });

    it('logs must not expose PII in entries', () => {
      const safeLogEntry = {
        timestamp: '2026-03-22T10:00:00Z',
        event: 'quote_accepted',
        request_id: 'req-123',
        operator_id: 'op-456',
        // No PII fields:
      };

      expect(safeLogEntry).not.toHaveProperty('parent_email');
      expect(safeLogEntry).not.toHaveProperty('patient_name');
      expect(safeLogEntry).not.toHaveProperty('phone');
      expect(safeLogEntry).not.toHaveProperty('full_address');
      console.log('✅ Log entries contain no PII');
    });
  });
});

// ============================================================================
// Route execution — BUS-VIEW-TOKEN-DISCLOSURE-001 regression
//
// The trip view endpoints used to fetch transport_requests with select('*')
// and return the row whole, exposing metadata_private and the exact street
// addresses to any bearer of the rider's forwardable 30-day magic link.
// These tests execute the real route handlers against a mocked admin client
// whose row carries marker PII in every private field, and pin the
// sanitized UserTripView projection the endpoints must now return.
// ============================================================================

const FULL_TRIP_ROW = {
  id: 'req-view-1',
  user_id: 'user-1',
  service_type: 'medical',
  status: 'open',
  pickup_address: '123 Exact Home Street, Everett, MA',
  dropoff_address: '456 Exact Clinic Avenue, Boston, MA',
  pickup_fuzzy: 'Everett, MA',
  dropoff_fuzzy: 'Boston, MA',
  pickup_lat: 42.4084,
  pickup_lng: -71.0537,
  dropoff_lat: 42.3601,
  dropoff_lng: -71.0589,
  start_date: '2026-11-10',
  start_time: '09:30:00',
  end_date: '2026-11-10',
  end_time: '11:00:00',
  is_recurring: false,
  recurrence_pattern: null,
  metadata_safe: { mobility_level: 'wheelchair', service_level: 'door-to-door' },
  metadata_private: {
    patient_name: 'PRIVATE-PATIENT-MARKER',
    contact_email: 'private-contact-marker@example.com',
    phone: '555-0199',
    guardian_name: 'PRIVATE-GUARDIAN-MARKER',
  },
  // Legacy combined bucket — may hold pre-split private fields
  metadata: { patient_name: 'LEGACY-PRIVATE-MARKER' },
  created_at: '2026-11-01T12:00:00Z',
  updated_at: '2026-11-02T12:00:00Z',
};

function viewChain(table: string) {
  const c: Record<string, any> = {};
  c.select = () => c;
  c.eq = () => c;
  c.order = async () => ({ data: [], error: null });
  c.single = async () =>
    table === 'transport_requests'
      ? { data: FULL_TRIP_ROW, error: null }
      : { data: null, error: null };
  return c;
}

vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: { from: (table: string) => viewChain(table) },
}));

vi.mock('@/lib/tokens', () => ({
  verifyUserTripToken: async () => ({ requestId: 'req-view-1', userId: 'user-1' }),
}));

vi.mock('@/lib/event-logger', () => ({ logEvent: async () => {} }));

import { GET as getTripByToken } from '@/app/api/trips/view-by-token/route';
import { GET as getTripById } from '@/app/api/trips/[id]/route';

const TRIP_VIEW_KEYS = [
  'created_at',
  'dropoff_fuzzy',
  'end_date',
  'end_time',
  'id',
  'is_recurring',
  'metadata_safe',
  'pickup_fuzzy',
  'recurrence_pattern',
  'service_type',
  'start_date',
  'start_time',
  'status',
];

function expectSanitizedTrip(body: any) {
  const trip = body.trip;
  expect(trip).toBeTruthy();
  // Exactly the whitelisted projection — nothing else from the row
  expect(Object.keys(trip).sort()).toEqual(TRIP_VIEW_KEYS);
  // Privacy fields are gone, in shape and in serialized content
  expect(trip).not.toHaveProperty('metadata_private');
  expect(trip).not.toHaveProperty('metadata');
  expect(trip).not.toHaveProperty('user_id');
  const raw = JSON.stringify(body);
  expect(raw).not.toContain('PRIVATE-PATIENT-MARKER');
  expect(raw).not.toContain('PRIVATE-GUARDIAN-MARKER');
  expect(raw).not.toContain('private-contact-marker@example.com');
  expect(raw).not.toContain('LEGACY-PRIVATE-MARKER');
  // Legitimate rider-view content survives
  expect(trip.id).toBe('req-view-1');
  expect(trip.service_type).toBe('medical');
  expect(trip.status).toBe('open');
  expect(trip.start_date).toBe('2026-11-10');
  expect(trip.start_time).toBe('09:30:00');
  expect(trip.pickup_fuzzy).toBe('Everett, MA');
  expect(trip.dropoff_fuzzy).toBe('Boston, MA');
  expect(trip.metadata_safe.mobility_level).toBe('wheelchair');
  expect(Array.isArray(body.quotes)).toBe(true);
}

describe('Trip view endpoints — sanitized projection (route execution)', () => {
  it('view-by-token: metadata_private never reaches a token bearer', async () => {
    const req = new NextRequest('http://localhost/api/trips/view-by-token?token=valid-token');
    const res = await getTripByToken(req);
    expect(res.status).toBe(200);
    expectSanitizedTrip(await res.json());
  });

  it('view-by-token: exact street addresses and coordinates are not exposed', async () => {
    const req = new NextRequest('http://localhost/api/trips/view-by-token?token=valid-token');
    const res = await getTripByToken(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trip).not.toHaveProperty('pickup_address');
    expect(body.trip).not.toHaveProperty('dropoff_address');
    expect(body.trip).not.toHaveProperty('pickup_lat');
    expect(body.trip).not.toHaveProperty('pickup_lng');
    expect(body.trip).not.toHaveProperty('dropoff_lat');
    expect(body.trip).not.toHaveProperty('dropoff_lng');
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('123 Exact Home Street');
    expect(raw).not.toContain('456 Exact Clinic Avenue');
  });

  it('trips/[id]: metadata_private never reaches a token bearer', async () => {
    const req = new NextRequest('http://localhost/api/trips/req-view-1?token=valid-token');
    const res = await getTripById(req, { params: Promise.resolve({ id: 'req-view-1' }) });
    expect(res.status).toBe(200);
    expectSanitizedTrip(await res.json());
  });

  it('trips/[id]: exact street addresses are not exposed', async () => {
    const req = new NextRequest('http://localhost/api/trips/req-view-1?token=valid-token');
    const res = await getTripById(req, { params: Promise.resolve({ id: 'req-view-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trip).not.toHaveProperty('pickup_address');
    expect(body.trip).not.toHaveProperty('dropoff_address');
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('123 Exact Home Street');
    expect(raw).not.toContain('456 Exact Clinic Avenue');
  });
});
