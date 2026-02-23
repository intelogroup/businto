import { z } from 'zod';

/**
 * Fail-closed validation for metadata split
 * 
 * CRITICAL: These schemas enforce architectural boundary.
 * - Safe metadata: visible to operators
 * - Private metadata: PII, server-side only
 * 
 * If a private field appears in safe metadata, validation MUST fail.
 * Whitelist approach only - no silent reshuffling.
 */

// School service - SAFE metadata (operator-visible)
export const schoolSafeMetadataSchema = z.object({
  school_name: z.string().optional(),
  grade_level: z.string().optional(),
  student_count: z.number().min(1, 'At least 1 student is required').max(100),
  schedule_type: z.enum(['round-trip', 'am-only', 'pm-only']),
  am_pickup_time: z.string().optional(),
  pm_pickup_time: z.string().optional(),
  special_needs: z.string().optional(),
  needs_wheelchair: z.boolean().optional(),
  needs_car_seat: z.boolean().optional(),
  special_requirements: z.string().optional(),
  note: z.string().optional(),
}).strict(); // .strict() ensures NO extra fields

// School service - PRIVATE metadata (PII)
export const schoolPrivateMetadataSchema = z.object({
  parent_name: z.string().optional(),
  parent_phone: z.string().optional(),
  parent_email: z.string().email().optional(),
}).strict();

// Medical service - SAFE metadata
export const medicalSafeMetadataSchema = z.object({
  mobility_level: z.enum(['ambulatory', 'wheelchair', 'stretcher']),
  service_level: z.enum(['curb-to-curb', 'door-to-door', 'door-through-door']),
  trip_type: z.enum(['one-way', 'round-trip', 'wait-and-return']),
  appointment_time: z.string().min(1, 'Appointment time is required'),
  return_time: z.string().optional(),
  special_equipment: z.string().optional(),
  oxygen_required: z.boolean().default(false),
  wheelchair_type: z.string().optional(),
  attendant_needed: z.boolean().default(false),
  medical_notes: z.string().optional(),
  note: z.string().optional(),
}).strict();

// Medical service - PRIVATE metadata
export const medicalPrivateMetadataSchema = z.object({
  patient_name: z.string().optional(),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().email().optional(),
  emergency_contact: z.string().optional(),
  emergency_phone: z.string().optional(),
}).strict();

// Wedding service - SAFE metadata
export const weddingSafeMetadataSchema = z.object({
  guest_count: z.number().min(1, 'At least 1 guest is required').max(500),
  vehicle_style: z.enum(['shuttle', 'coach', 'limo', 'party-bus']),
  itinerary_type: z.enum(['hotel-to-venue', 'venue-to-hotel', 'shuttle-service', 'full-day']),
  event_name: z.string().optional(),
  pickup_time: z.string().min(1, 'Pickup time is required'),
  return_time: z.string().optional(),
  special_requests: z.string().optional(),
  duration_hours: z.number().min(1).max(24).optional(),
  service_level: z.string().optional(),
  note: z.string().optional(),
}).strict();

// Wedding service - PRIVATE metadata
export const weddingPrivateMetadataSchema = z.object({
  contact_name: z.string().min(1, 'Contact name is required'),
  contact_phone: z.string().min(1, 'Contact phone is required'),
  contact_email: z.string().email('Valid email is required'),
}).strict();

// Corporate service - SAFE metadata
export const corporateSafeMetadataSchema = z.object({
  passenger_count: z.number().min(1).max(500),
  vehicle_style: z.enum(['shuttle', 'coach', 'executive', 'van']),
  service_level: z.enum(['standard', 'premium', 'executive']),
  special_requests: z.string().optional(),
  event_type: z.string().optional(),
  duration_hours: z.number().min(1).max(24).optional(),
  note: z.string().optional(),
}).strict();

// Corporate service - PRIVATE metadata
export const corporatePrivateMetadataSchema = z.object({
  contact_name: z.string().min(1, 'Contact name is required'),
  contact_phone: z.string().min(1, 'Contact phone is required'),
  contact_email: z.string().email('Valid email is required'),
  company_name: z.string().optional(),
  billing_contact: z.string().optional(),
}).strict();

/**
 * Split metadata validator
 * 
 * Takes incoming metadata object and service type, validates against
 * safe/private schemas, returns split objects.
 * 
 * FAILS CLOSED: throws if any private field in safe, or any unknown field.
 */
export function splitAndValidateMetadata(
  metadata: Record<string, any>,
  serviceType: 'school' | 'medical' | 'wedding' | 'corporate'
): { metadata_safe: Record<string, any>; metadata_private: Record<string, any> } {
  
  // Get appropriate schemas for service type
  const schemas = {
    school: {
      safe: schoolSafeMetadataSchema,
      private: schoolPrivateMetadataSchema,
    },
    medical: {
      safe: medicalSafeMetadataSchema,
      private: medicalPrivateMetadataSchema,
    },
    wedding: {
      safe: weddingSafeMetadataSchema,
      private: weddingPrivateMetadataSchema,
    },
    corporate: {
      safe: corporateSafeMetadataSchema,
      private: corporatePrivateMetadataSchema,
    },
  };

  const { safe: safeSchema, private: privateSchema } = schemas[serviceType];

  // Split fields into safe and private buckets
  const safeFields = Object.keys(safeSchema.shape);
  const privateFields = Object.keys(privateSchema.shape);

  const metadata_safe: Record<string, any> = {};
  const metadata_private: Record<string, any> = {};
  const unknownFields: string[] = [];

  // Categorize each field
  for (const [key, value] of Object.entries(metadata)) {
    if (safeFields.includes(key)) {
      metadata_safe[key] = value;
    } else if (privateFields.includes(key)) {
      metadata_private[key] = value;
    } else {
      unknownFields.push(key);
    }
  }

  // FAIL CLOSED: reject unknown fields
  if (unknownFields.length > 0) {
    throw new Error(
      `Unknown metadata fields for ${serviceType} service: ${unknownFields.join(', ')}. ` +
      `Request rejected - all fields must be explicitly categorized as safe or private.`
    );
  }

  // Validate safe metadata against schema
  const safeResult = safeSchema.safeParse(metadata_safe);
  if (!safeResult.success) {
    throw new Error(`Invalid safe metadata: ${safeResult.error.message}`);
  }

  // Validate private metadata against schema
  const privateResult = privateSchema.safeParse(metadata_private);
  if (!privateResult.success) {
    throw new Error(`Invalid private metadata: ${privateResult.error.message}`);
  }

  return {
    metadata_safe: safeResult.data,
    metadata_private: privateResult.data,
  };
}

/**
 * Detect if private fields leaked into safe metadata
 * Used as additional safety check
 */
export function detectPrivateFieldsInSafe(
  metadata_safe: Record<string, any>,
  serviceType: 'school' | 'medical' | 'wedding' | 'corporate'
): string[] {
  // Explicit list of private PII field names (more precise than pattern matching)
  const privateFieldNames = [
    'parent_name',
    'parent_email',
    'parent_phone',
    'contact_name',
    'contact_email',
    'contact_phone',
    'patient_name',
    'emergency_contact',
    'emergency_phone',
    'billing_contact',
    'billing_email',
    'company_name', // Corporate billing info
  ];

  const leaked: string[] = [];

  for (const key of Object.keys(metadata_safe)) {
    if (privateFieldNames.includes(key)) {
      leaked.push(key);
    }
  }

  return leaked;
}
