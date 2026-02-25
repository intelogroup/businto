import { describe, it, expect } from 'vitest';
import { splitMetadataByServiceType } from '@/lib/metadata-helpers';
import {
  splitAndValidateMetadata,
  detectPrivateFieldsInSafe
} from '@/lib/validation-split';

describe('Metadata Security - Split Functionality', () => {
  describe('splitMetadataByServiceType', () => {
    it('should split school metadata correctly', () => {
      const schoolMetadata = {
        school_name: 'Test School',
        grade_level: '5',
        student_count: 2,
        schedule_type: 'round-trip' as const,
        parent_email: 'parent@example.com',
        parent_name: 'John Doe',
      };

      const result = splitMetadataByServiceType('school', schoolMetadata);

      expect(result.metadata_safe).toHaveProperty('school_name', 'Test School');
      expect(result.metadata_safe).toHaveProperty('grade_level', '5');
      expect(result.metadata_safe).toHaveProperty('student_count', 2);
      expect(result.metadata_safe).not.toHaveProperty('parent_email');
      expect(result.metadata_safe).not.toHaveProperty('parent_name');

      expect(result.metadata_private).toHaveProperty('parent_email', 'parent@example.com');
      expect(result.metadata_private).toHaveProperty('parent_name', 'John Doe');
    });

    it('should split medical metadata correctly', () => {
      const medicalMetadata = {
        mobility_level: 'wheelchair' as const,
        service_level: 'door-to-door' as const,
        trip_type: 'one-way' as const,
        appointment_time: '10:00',
        patient_name: 'Jane Doe',
        contact_email: 'contact@example.com',
      };

      const result = splitMetadataByServiceType('medical', medicalMetadata);

      expect(result.metadata_safe).toHaveProperty('mobility_level', 'wheelchair');
      expect(result.metadata_safe).toHaveProperty('service_level', 'door-to-door');
      expect(result.metadata_safe).not.toHaveProperty('patient_name');
      expect(result.metadata_safe).not.toHaveProperty('contact_email');

      expect(result.metadata_private).toHaveProperty('patient_name', 'Jane Doe');
      expect(result.metadata_private).toHaveProperty('contact_email', 'contact@example.com');
    });

    it('should split wedding metadata correctly', () => {
      const weddingMetadata = {
        guest_count: 50,
        vehicle_style: 'shuttle' as const,
        itinerary_type: 'hotel-to-venue' as const,
        pickup_time: '14:00',
        contact_name: 'Event Coordinator',
        contact_email: 'event@example.com',
        contact_phone: '555-1234',
      };

      const result = splitMetadataByServiceType('wedding', weddingMetadata);

      expect(result.metadata_safe).toHaveProperty('guest_count', 50);
      expect(result.metadata_safe).toHaveProperty('vehicle_style', 'shuttle');
      expect(result.metadata_safe).not.toHaveProperty('contact_name');
      expect(result.metadata_safe).not.toHaveProperty('contact_email');
      expect(result.metadata_safe).not.toHaveProperty('contact_phone');

      expect(result.metadata_private).toHaveProperty('contact_name', 'Event Coordinator');
      expect(result.metadata_private).toHaveProperty('contact_email', 'event@example.com');
      expect(result.metadata_private).toHaveProperty('contact_phone', '555-1234');
    });
  });

  describe('detectPrivateFieldsInSafe - Security Validation', () => {
    it('should detect email leaked in safe metadata', () => {
      const metadata_safe = {
        school_name: 'Test School',
        parent_email: 'leaked@example.com', // This should be caught!
      };

      const leaked = detectPrivateFieldsInSafe(metadata_safe, 'school');

      expect(leaked).toContain('parent_email');
      expect(leaked.length).toBeGreaterThan(0);
    });

    it('should detect phone leaked in safe metadata', () => {
      const metadata_safe = {
        guest_count: 50,
        contact_phone: '555-1234', // This should be caught!
      };

      const leaked = detectPrivateFieldsInSafe(metadata_safe, 'wedding');

      expect(leaked).toContain('contact_phone');
    });

    it('should detect name leaked in safe metadata', () => {
      const metadata_safe = {
        mobility_level: 'wheelchair',
        patient_name: 'John Doe', // This should be caught!
      };

      const leaked = detectPrivateFieldsInSafe(metadata_safe, 'medical');

      expect(leaked).toContain('patient_name');
    });

    it('should not flag safe fields without PII patterns', () => {
      const metadata_safe = {
        grade_level: '5',
        student_count: 2,
        schedule_type: 'round-trip',
      };

      const leaked = detectPrivateFieldsInSafe(metadata_safe, 'school');

      expect(leaked).toHaveLength(0);
    });
  });

  describe('splitAndValidateMetadata - Fail-Closed Validation', () => {
    it('should successfully validate and split valid school metadata', () => {
      const metadata = {
        school_name: 'Test School',
        grade_level: '5',
        student_count: 2,
        schedule_type: 'round-trip',
        parent_email: 'parent@example.com',
        duration_type: 'daily',
      };

      const result = splitAndValidateMetadata(metadata, 'school');

      expect(result.metadata_safe).toHaveProperty('school_name');
      expect(result.metadata_safe).toHaveProperty('grade_level');
      expect(result.metadata_private).toHaveProperty('parent_email');
    });

    it('should throw on unknown fields in school metadata', () => {
      const metadata = {
        school_name: 'Test School',
        grade_level: '5',
        student_count: 2,
        schedule_type: 'round-trip',
        duration_type: 'daily',
        unknown_field: 'should fail', // Unknown field!
      };

      expect(() => {
        splitAndValidateMetadata(metadata, 'school');
      }).toThrow();
    });

    it('should successfully validate medical metadata with required fields', () => {
      const metadata = {
        mobility_level: 'wheelchair',
        service_level: 'door-to-door',
        trip_type: 'one-way',
        appointment_time: '10:00',
        patient_name: 'Jane Doe',
      };

      const result = splitAndValidateMetadata(metadata, 'medical');

      expect(result.metadata_safe).toHaveProperty('mobility_level', 'wheelchair');
      expect(result.metadata_private).toHaveProperty('patient_name', 'Jane Doe');
    });

    it('should throw on invalid enum values', () => {
      const metadata = {
        mobility_level: 'flying', // Invalid enum value!
        service_level: 'door-to-door',
        trip_type: 'one-way',
        appointment_time: '10:00',
      };

      expect(() => {
        splitAndValidateMetadata(metadata, 'medical');
      }).toThrow();
    });
  });
});

describe('Metadata Security - Architectural Boundary Tests', () => {
  it('CRITICAL: should never allow email in safe metadata', () => {
    // This test ensures the core security boundary is enforced
    const maliciousMetadata = {
      school_name: 'Test School',
      grade_level: '5',
      student_count: 2,
      schedule_type: 'round-trip',
      duration_type: 'daily',
      email: 'leaked@example.com', // Attempt to leak email
    };

    expect(() => {
      splitAndValidateMetadata(maliciousMetadata, 'school');
    }).toThrow();
  });

  it('CRITICAL: should never allow phone in safe metadata', () => {
    const maliciousMetadata = {
      mobility_level: 'wheelchair',
      service_level: 'door-to-door',
      trip_type: 'one-way',
      appointment_time: '10:00',
      phone: '555-1234', // Attempt to leak phone
    };

    expect(() => {
      splitAndValidateMetadata(maliciousMetadata, 'medical');
    }).toThrow();
  });

  it('CRITICAL: should never allow contact name in safe metadata', () => {
    const maliciousMetadata = {
      guest_count: 50,
      vehicle_style: 'shuttle',
      itinerary_type: 'hotel-to-venue',
      pickup_time: '14:00',
      name: 'John Doe', // Attempt to leak name
    };

    expect(() => {
      splitAndValidateMetadata(maliciousMetadata, 'wedding');
    }).toThrow();
  });
});

describe('Find Care Ride Button - Form Payload Validation', () => {
  it('should NOT throw for a one-way medical ride (single appointment)', () => {
    const medicalMetadata = {
      mobility_level: 'ambulatory' as const,
      service_level: 'curb-to-curb' as const,
      trip_type: 'one-way' as const,
      appointment_time: '10:00',
      oxygen_use: false,
      is_bariatric: false,
      stair_factor: 'none' as const,
      service_animal: false,
      medical_start_date: '2026-02-25',
    };

    expect(() => splitAndValidateMetadata(medicalMetadata, 'medical')).not.toThrow();
  });

  it('should NOT throw for a round-trip ride with return_time and contact PII in private', () => {
    const medicalMetadata = {
      mobility_level: 'manual-wheelchair' as const,
      service_level: 'door-to-door' as const,
      trip_type: 'round-trip' as const,
      appointment_time: '09:30',
      return_status: 'fixed' as const,
      return_time: '13:00',
      oxygen_use: true,
      is_bariatric: false,
      facility_details: 'Suite 400',
      stair_factor: 'none' as const,
      additional_passengers: 1,
      service_animal: false,
      medical_start_date: '2026-03-01',
      note: 'Please ring doorbell',
      patient_name: 'Jane Smith',
      contact_name: 'Jane Smith',
      contact_phone: '617-555-0100',
      contact_email: 'jane@example.com',
    };

    expect(() => splitAndValidateMetadata(medicalMetadata, 'medical')).not.toThrow();

    const { metadata_safe, metadata_private } = splitAndValidateMetadata(medicalMetadata, 'medical');

    // PII must not leak into safe
    expect(metadata_safe).not.toHaveProperty('patient_name');
    expect(metadata_safe).not.toHaveProperty('contact_name');
    expect(metadata_safe).not.toHaveProperty('contact_phone');
    expect(metadata_safe).not.toHaveProperty('contact_email');

    // PII must be in private
    expect(metadata_private).toHaveProperty('patient_name', 'Jane Smith');
    expect(metadata_private).toHaveProperty('contact_phone', '617-555-0100');
  });

  it('REGRESSION: should NOT throw for recurring ride with medical_start_date + medical_end_date', () => {
    // This was the exact failing scenario — recurring rides send both date fields
    // which were previously unknown to the strict schema
    const medicalMetadata = {
      mobility_level: 'ambulatory' as const,
      service_level: 'curb-to-curb' as const,
      trip_type: 'one-way' as const,
      appointment_time: '08:00',
      oxygen_use: false,
      is_bariatric: false,
      stair_factor: 'none' as const,
      service_animal: false,
      medical_start_date: '2026-03-01',
      medical_end_date: '2026-06-30', // ← was causing the "Unknown metadata fields" error
      patient_name: 'Recurring Patient',
      contact_name: 'Caregiver',
      contact_phone: '617-555-9999',
      contact_email: 'caregiver@example.com',
    };

    expect(() => splitAndValidateMetadata(medicalMetadata, 'medical')).not.toThrow();

    const { metadata_safe } = splitAndValidateMetadata(medicalMetadata, 'medical');
    expect(metadata_safe).toHaveProperty('medical_start_date', '2026-03-01');
    expect(metadata_safe).toHaveProperty('medical_end_date', '2026-06-30');
  });

  it('should still BLOCK unknown fields in medical metadata', () => {
    const badMetadata = {
      mobility_level: 'ambulatory' as const,
      service_level: 'curb-to-curb' as const,
      trip_type: 'one-way' as const,
      appointment_time: '10:00',
      random_unknown_field: 'value',
    };

    expect(() => splitAndValidateMetadata(badMetadata, 'medical')).toThrow(/Unknown metadata fields/);
  });
});

