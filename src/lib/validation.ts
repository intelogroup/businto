import { z } from 'zod';

// Base schema for all transport requests
const baseRequestSchema = z.object({
  service_type: z.enum(['school', 'medical', 'wedding', 'corporate']),
  pickup_address: z.string().optional(),
  dropoff_address: z.string().optional(),
  pickup_fuzzy: z.string().optional(),
  dropoff_fuzzy: z.string().optional(),
  pickup_lat: z.number().optional(),
  pickup_lng: z.number().optional(),
  dropoff_lat: z.number().optional(),
  dropoff_lng: z.number().optional(),
  start_date: z.string().optional(),
  start_time: z.string().optional(),
  end_date: z.string().optional(),
  is_recurring: z.boolean().default(false),
  recurrence_pattern: z.string().optional(),
  is_immediate: z.boolean().optional(),
});

// ============================================
// SCHEMA DEFINITIONS (Single Source of Truth)
// ============================================

export const schoolSafeMetadataSchema = z.object({
  school_name: z.string().optional(),
  grade_level: z.string().optional(),
  student_count: z.number().min(1, 'At least 1 student is required').max(100),
  student_age: z.number().optional(),
  schedule_type: z.enum(['round-trip', 'am-only', 'pm-only']),
  am_pickup_time: z.string().optional(),
  pm_pickup_time: z.string().optional(),
  is_immediate: z.boolean().optional(),
  school_recurring: z.string().optional(),
  selected_days: z.string().optional(),
  school_start_time: z.string().optional(),
  school_dismissal_time: z.string().optional(),
  early_dismissal_notes: z.string().optional(),
  special_needs: z.boolean().optional(),
  booster_seat: z.string().optional(),
  no_adult_release: z.boolean().optional(),
  needs_wheelchair: z.boolean().optional(),
  needs_car_seat: z.boolean().optional(),
  special_requirements: z.string().optional(),
  duration_type: z.string().optional(),
  note: z.string().optional(),
}).strict();

export const schoolPrivateMetadataSchema = z.object({
  parent_name: z.string().optional(),
  parent_phone: z.string().optional(),
  parent_email: z.string().email().optional(),
  guardian_name: z.string().optional(),
  guardian_phone: z.string().optional(),
  authorized_pickups: z.string().optional(),
  safe_word: z.string().optional(),
}).strict();

export const medicalSafeMetadataSchema = z.object({
  mobility_level: z.enum(['ambulatory', 'wheelchair', 'manual-wheelchair', 'electric-wheelchair', 'stretcher']),
  service_level: z.enum(['curb-to-curb', 'door-to-door', 'door-through-door', 'hand-to-hand', 'white-glove']),
  trip_type: z.enum(['one-way', 'round-trip', 'wait-and-return']),
  appointment_time: z.string().optional(),
  return_time: z.string().optional(),
  return_status: z.enum(['fixed', 'will-call']).optional(),
  special_equipment: z.string().optional(),
  oxygen_required: z.boolean().optional(),
  oxygen_use: z.boolean().optional(),
  is_bariatric: z.boolean().optional(),
  facility_details: z.string().optional(),
  stair_factor: z.enum(['none', '1-5', 'flight']).optional(),
  additional_passengers: z.number().optional(),
  service_animal: z.boolean().optional(),
  wheelchair_type: z.string().optional(),
  attendant_needed: z.boolean().optional(),
  medical_notes: z.string().optional(),
  medical_start_date: z.string().optional(),
  medical_end_date: z.string().optional(),
  is_immediate: z.boolean().optional(),
  note: z.string().optional(),
}).strict();

export const medicalPrivateMetadataSchema = z.object({
  patient_name: z.string().optional(),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().email().optional(),
  emergency_contact: z.string().optional(),
  emergency_phone: z.string().optional(),
}).strict();

export const weddingSafeMetadataSchema = z.object({
  event_category: z.enum(['wedding', 'corporate', 'party', 'other']).optional(),
  guest_count: z.number().min(1, 'At least 1 guest is required').max(500),
  vehicle_style: z.enum(['shuttle', 'coach', 'limo', 'party-bus', 'school-bus', 'vintage']),
  itinerary_type: z.enum(['hotel-to-venue', 'venue-to-hotel', 'shuttle-service', 'full-day']),
  shuttle_mode: z.enum(['single-trip', 'continuous', 'end-of-night']).optional(),
  event_duration_type: z.enum(['single-day', 'multi-day', 'weekend', 'custom']).optional(),
  event_name: z.string().optional(),
  pickup_time: z.string().optional(),
  event_start_time: z.string().optional(),
  return_time: z.string().optional(),
  alcohol_allowed: z.boolean().optional(),
  refreshments_provided: z.boolean().optional(),
  av_needs: z.boolean().optional(),
  special_decor: z.boolean().optional(),
  special_requests: z.string().optional(),
  duration_hours: z.number().min(1).max(24).optional(),
  service_level: z.string().optional(),
  is_immediate: z.boolean().optional(),
  note: z.string().optional(),
}).strict();

export const weddingPrivateMetadataSchema = z.object({
  contact_name: z.string().min(1, 'Contact name is required'),
  contact_phone: z.string().min(1, 'Contact phone is required'),
  contact_email: z.string().email('Valid email is required'),
  day_of_contact_name: z.string().optional(),
  day_of_contact_phone: z.string().optional(),
}).strict();

export const corporateSafeMetadataSchema = z.object({
  passenger_count: z.number().min(1).max(500),
  vehicle_style: z.enum(['shuttle', 'coach', 'executive', 'van']),
  service_level: z.enum(['standard', 'premium', 'executive']),
  is_immediate: z.boolean().optional(),
  special_requests: z.string().optional(),
  event_type: z.string().optional(),
  duration_hours: z.number().min(1).max(24).optional(),
  note: z.string().optional(),
}).strict();

export const corporatePrivateMetadataSchema = z.object({
  contact_name: z.string().min(1, 'Contact name is required'),
  contact_phone: z.string().min(1, 'Contact phone is required'),
  contact_email: z.string().email('Valid email is required'),
  company_name: z.string().optional(),
  billing_contact: z.string().optional(),
}).strict();

// ============================================
// REQUEST SCHEMAS (Combined for client-side validation)
// ============================================

const schoolMetadataSchema = schoolSafeMetadataSchema.merge(schoolPrivateMetadataSchema);
const medicalMetadataSchema = medicalSafeMetadataSchema.merge(medicalPrivateMetadataSchema);
const weddingMetadataSchema = weddingSafeMetadataSchema.merge(weddingPrivateMetadataSchema);
const corporateMetadataSchema = corporateSafeMetadataSchema.merge(corporatePrivateMetadataSchema);

// School service specific validation
export const schoolRequestSchema = baseRequestSchema.extend({
  service_type: z.literal('school'),
  metadata: schoolMetadataSchema.refine((data) => {
    if (data.is_immediate) return true;
    if (data.schedule_type === 'round-trip' || data.schedule_type === 'am-only') {
      return !!data.am_pickup_time;
    }
    return true;
  }, {
    message: 'AM pickup time is required for this schedule type',
    path: ['am_pickup_time'],
  }).refine((data) => {
    if (data.is_immediate) return true;
    if (data.schedule_type === 'round-trip' || data.schedule_type === 'pm-only') {
      return !!data.pm_pickup_time;
    }
    return true;
  }, {
    message: 'PM pickup time is required for this schedule type',
    path: ['pm_pickup_time'],
  }).refine((data) => {
    if (data.school_recurring === 'recurring') {
      return !!data.selected_days && data.selected_days.length > 0;
    }
    return true;
  }, {
    message: 'Please select at least one day for recurring trips',
    path: ['selected_days'],
  }),
}).refine((data) => {
  if (data.is_immediate) return true;
  return !!data.start_date;
}, {
  message: 'Start date is required',
  path: ['start_date'],
});

// Medical service specific validation
export const medicalRequestSchema = baseRequestSchema.extend({
  service_type: z.literal('medical'),
  start_time: z.string().optional(),
  metadata: medicalMetadataSchema.refine((data) => {
    if (data.is_immediate) return true;
    return !!data.appointment_time;
  }, {
    message: 'Appointment time is required',
    path: ['appointment_time'],
  }).refine((data) => {
    if (data.trip_type === 'round-trip' && data.return_status === 'fixed') {
      return !!data.return_time;
    }
    return true;
  }, {
    message: 'Return time is required for fixed-time round trips',
    path: ['return_time'],
  }).refine((data) => {
    if (data.trip_type === 'round-trip') {
      return !!data.return_status;
    }
    return true;
  }, {
    message: 'Please specify the return status for your round trip',
    path: ['return_status'],
  }),
}).refine((data) => {
  if (data.is_immediate) return true;
  return !!data.start_date && !!data.start_time;
}, {
  message: 'Start date and appointment time are required',
  path: ['start_date'],
});

// Wedding service specific validation
export const weddingRequestSchema = baseRequestSchema.extend({
  service_type: z.literal('wedding'),
  start_time: z.string().optional(),
  metadata: weddingMetadataSchema.refine((data) => {
    if (data.is_immediate) return true;
    return !!data.pickup_time;
  }, {
    message: 'Pickup time is required',
    path: ['pickup_time'],
  }).refine((data) => {
    if (data.itinerary_type === 'shuttle-service' || data.itinerary_type === 'full-day') {
      return !!data.return_time;
    }
    return true;
  }, {
    message: 'Return time is required for shuttle service or full-day rental',
    path: ['return_time'],
  }).refine((data) => {
    if (data.itinerary_type === 'shuttle-service') {
      return !!data.shuttle_mode;
    }
    return true;
  }, {
    message: 'Please select a shuttle mode',
    path: ['shuttle_mode'],
  }),
}).refine((data) => {
  if (data.is_immediate) return true;
  return !!data.start_date && !!data.start_time;
}, {
  message: 'Start date and pickup time are required',
  path: ['start_date'],
});

// Corporate service specific validation
export const corporateRequestSchema = baseRequestSchema.extend({
  service_type: z.literal('corporate'),
  start_time: z.string().optional(),
  metadata: corporateMetadataSchema,
}).refine((data) => {
  if (data.is_immediate) return true;
  return !!data.start_date;
}, {
  message: 'Start date is required',
  path: ['start_date'],
});

// Union type for all request schemas
export const transportRequestSchema = z.discriminatedUnion('service_type', [
  schoolRequestSchema,
  medicalRequestSchema,
  weddingRequestSchema,
  corporateRequestSchema,
]);

// Type exports
export type SchoolRequest = z.infer<typeof schoolRequestSchema>;
export type MedicalRequest = z.infer<typeof medicalRequestSchema>;
export type WeddingRequest = z.infer<typeof weddingRequestSchema>;
export type CorporateRequest = z.infer<typeof corporateRequestSchema>;
export type TransportRequest = z.infer<typeof transportRequestSchema>;

// Helper function to validate and return errors in a user-friendly format
export function validateTransportRequest(data: unknown) {
  const result = transportRequestSchema.safeParse(data);

  if (!result.success) {
    const errors: Record<string, string> = {};
    result.error.issues.forEach((issue) => {
      const path = issue.path.join('.');
      errors[path] = issue.message;
    });
    return { success: false as const, errors };
  }

  return { success: true as const, data: result.data };
}

// API validation schema (for server-side with user_id)
export const apiRequestSchema = z.union([
  schoolRequestSchema.extend({ user_id: z.string().uuid().optional() }),
  medicalRequestSchema.extend({ user_id: z.string().uuid().optional() }),
  weddingRequestSchema.extend({ user_id: z.string().uuid().optional() }),
  corporateRequestSchema.extend({ user_id: z.string().uuid().optional() }),
]);

export type ApiRequest = z.infer<typeof apiRequestSchema>;

// ============================================
// SERVER-SIDE METADATA SPLITTING
// ============================================

export function splitAndValidateMetadata(
  metadata: Record<string, any>,
  serviceType: 'school' | 'medical' | 'wedding' | 'corporate'
): { metadata_safe: Record<string, any>; metadata_private: Record<string, any> } {
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

  const safeFields = Object.keys(safeSchema.shape);
  const privateFields = Object.keys(privateSchema.shape);

  const metadata_safe: Record<string, any> = {};
  const metadata_private: Record<string, any> = {};
  const unknownFields: string[] = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (safeFields.includes(key)) {
      metadata_safe[key] = value;
    } else if (privateFields.includes(key)) {
      metadata_private[key] = value;
    } else {
      unknownFields.push(key);
    }
  }

  if (unknownFields.length > 0) {
    throw new Error(
      `Unknown metadata fields for ${serviceType} service: ${unknownFields.join(', ')}. ` +
      `Request rejected - all fields must be explicitly categorized as safe or private.`
    );
  }

  const safeResult = safeSchema.safeParse(metadata_safe);
  if (!safeResult.success) {
    throw new Error(`Invalid safe metadata: ${safeResult.error.message}`);
  }

  const privateResult = privateSchema.safeParse(metadata_private);
  if (!privateResult.success) {
    throw new Error(`Invalid private metadata: ${privateResult.error.message}`);
  }

  return {
    metadata_safe: safeResult.data,
    metadata_private: privateResult.data,
  };
}

export function detectPrivateFieldsInSafe(
  metadata_safe: Record<string, any>,
  serviceType: 'school' | 'medical' | 'wedding' | 'corporate'
): string[] {
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
    'company_name',
  ];

  const leaked: string[] = [];

  for (const key of Object.keys(metadata_safe)) {
    if (privateFieldNames.includes(key)) {
      leaked.push(key);
    }
  }

  return leaked;
}
