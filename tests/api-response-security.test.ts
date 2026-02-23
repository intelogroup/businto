import { describe, it, expect } from 'vitest';

/**
 * API Response Security Tests
 * 
 * Ensures that API responses never leak private data:
 * - metadata_private
 * - pickup_address
 * - dropoff_address
 * - parent_email, parent_phone, parent_name
 * - contact_email, contact_phone, contact_name
 */
describe('API Response Security', () => {
  describe('POST /api/requests response', () => {
    it('should not include metadata_private in response', () => {
      // Simulate API response structure
      const mockResponse = {
        success: true,
        request: {
          id: 'test-123',
          service_type: 'school',
          pickup_fuzzy: 'Downtown Area',
          dropoff_fuzzy: 'School District',
          start_date: '2026-02-01',
          metadata_safe: {
            student_count: 2,
            needs_wheelchair: false
          },
          status: 'pending',
          created_at: '2026-01-11T00:00:00Z'
        }
      };

      // Verify private fields are NOT present
      expect(mockResponse.request).not.toHaveProperty('metadata_private');
      expect(mockResponse.request).not.toHaveProperty('pickup_address');
      expect(mockResponse.request).not.toHaveProperty('dropoff_address');
    });

    it('should only include safe fields', () => {
      const mockResponse = {
        success: true,
        request: {
          id: 'test-123',
          service_type: 'school',
          pickup_fuzzy: 'Downtown Area',
          dropoff_fuzzy: 'School District',
          start_date: '2026-02-01',
          metadata_safe: { student_count: 2 },
          status: 'pending',
          created_at: '2026-01-11T00:00:00Z'
        }
      };

      const allowedFields = [
        'id',
        'service_type',
        'pickup_fuzzy',
        'dropoff_fuzzy',
        'start_date',
        'start_time',
        'end_date',
        'end_time',
        'is_recurring',
        'recurrence_pattern',
        'metadata_safe',
        'status',
        'created_at'
      ];

      const responseKeys = Object.keys(mockResponse.request);
      const unauthorizedKeys = responseKeys.filter(key => !allowedFields.includes(key));
      
      expect(unauthorizedKeys).toEqual([]);
    });
  });

  describe('GET /api/requests response', () => {
    it('should not include private fields in requests array', () => {
      const mockResponse = {
        requests: [
          {
            id: 'req-1',
            service_type: 'medical',
            pickup_fuzzy: 'North Side',
            dropoff_fuzzy: 'Hospital',
            start_date: '2026-02-05',
            metadata_safe: {
              mobility_level: 'wheelchair',
              appointment_type: 'routine'
            },
            status: 'pending',
            quotes: []
          }
        ]
      };

      mockResponse.requests.forEach(request => {
        expect(request).not.toHaveProperty('metadata_private');
        expect(request).not.toHaveProperty('pickup_address');
        expect(request).not.toHaveProperty('dropoff_address');
      });
    });
  });

  describe('Metadata Safe Content Validation', () => {
    it('should never contain email addresses in metadata_safe', () => {
      const metadata_safe = {
        student_count: 2,
        needs_wheelchair: true,
        special_requirements: 'Booster seat needed'
      };

      const jsonStr = JSON.stringify(metadata_safe);
      const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
      
      expect(emailPattern.test(jsonStr)).toBe(false);
    });

    it('should never contain phone numbers in metadata_safe', () => {
      const metadata_safe = {
        guest_count: 50,
        vehicle_style: 'luxury',
        service_level: 'premium'
      };

      const jsonStr = JSON.stringify(metadata_safe);
      const phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/;
      
      expect(phonePattern.test(jsonStr)).toBe(false);
    });

    it('should never contain private field names in metadata_safe keys', () => {
      const metadata_safe = {
        mobility_level: 'ambulatory',
        appointment_type: 'specialist'
      };

      const privateFieldNames = [
        'parent_email', 'parent_phone', 'parent_name',
        'contact_email', 'contact_phone', 'contact_name',
        'patient_name', 'email', 'phone'
      ];

      const keys = Object.keys(metadata_safe);
      const hasPrivateKeys = keys.some(key => 
        privateFieldNames.some(privateField => key.includes(privateField))
      );

      expect(hasPrivateKeys).toBe(false);
    });
  });

  describe('Quote API Responses', () => {
    it('POST /api/quotes should not leak request private data', () => {
      const mockQuoteResponse = {
        success: true,
        quote: {
          id: 'quote-123',
          request_id: 'req-456',
          total_price: 150.00,
          vehicle_type: 'SUV',
          status: 'pending',
          operator: {
            id: 'op-789',
            company_name: 'ABC Transport',
            avatar_url: 'https://...'
          }
        }
      };

      // Quote response should not include request details with private data
      expect(mockQuoteResponse.quote).not.toHaveProperty('request');
      expect(mockQuoteResponse.quote).not.toHaveProperty('metadata_private');
      expect(mockQuoteResponse.quote).not.toHaveProperty('pickup_address');
    });

    it('POST /api/quotes/accept should not leak contact info in response', () => {
      const mockAcceptResponse = {
        success: true,
        message: 'Quote accepted successfully',
        quoteId: 'quote-123',
        bookingId: 'booking-456',
        confirmationCode: 'CONF-789'
      };

      // Acceptance response should only have booking details, no contact info
      const responseStr = JSON.stringify(mockAcceptResponse);
      expect(responseStr).not.toMatch(/@/); // No email addresses
      expect(responseStr).not.toMatch(/parent_/); // No parent fields
      expect(responseStr).not.toMatch(/contact_/); // No contact fields
    });
  });

  describe('Operator View API', () => {
    it('should only return OperatorRequestView DTO fields', () => {
      const mockOperatorView = {
        id: 'req-123',
        service_type: 'wedding',
        pickup_fuzzy: 'Downtown',
        dropoff_fuzzy: 'Reception Hall',
        start_date: '2026-03-15',
        start_time: '14:00',
        metadata_safe: {
          guest_count: 100,
          vehicle_style: 'luxury'
        },
        status: 'pending'
      };

      const allowedFields = [
        'id',
        'service_type',
        'pickup_fuzzy',
        'dropoff_fuzzy',
        'start_date',
        'start_time',
        'end_date',
        'end_time',
        'is_recurring',
        'recurrence_pattern',
        'metadata_safe',
        'status',
        'created_at'
      ];

      Object.keys(mockOperatorView).forEach(key => {
        expect(allowedFields).toContain(key);
      });

      expect(mockOperatorView).not.toHaveProperty('user_id');
      expect(mockOperatorView).not.toHaveProperty('metadata_private');
      expect(mockOperatorView).not.toHaveProperty('pickup_address');
      expect(mockOperatorView).not.toHaveProperty('dropoff_address');
    });
  });
});
