import { z } from 'zod';

// Base schema for all transport requests
const baseRequestSchema = z.object({
  service_type: z.enum(['school', 'medical', 'wedding']),
  pickup_address: z.string().optional(), // Made optional for dev mode
  dropoff_address: z.string().optional(), // Made optional for dev mode
  pickup_fuzzy: z.string().optional(),
  dropoff_fuzzy: z.string().optional(),
  pickup_lat: z.number().optional(),
  pickup_lng: z.number().optional(),
  dropoff_lat: z.number().optional(),
  dropoff_lng: z.number().optional(),
  start_date: z.string().min(1, 'Start date is required'),
  start_time: z.string().optional(),
  end_date: z.string().optional(),
  is_recurring: z.boolean().default(false),
  recurrence_pattern: z.string().optional(),
});

// School service specific validation
export const schoolRequestSchema = baseRequestSchema.extend({
  service_type: z.literal('school'),
  metadata: z.object({
    // Core
    school_name: z.string().optional(),
    grade_level: z.string().optional(),
    student_count: z.number().min(1, 'At least 1 student is required').max(100),
    student_age: z.number().optional(),
    schedule_type: z.enum(['round-trip', 'am-only', 'pm-only']),
    am_pickup_time: z.string().optional(),
    pm_pickup_time: z.string().optional(),
    // Schedule details
    school_recurring: z.enum(['recurring', 'one-time']),
    selected_days: z.string().optional(),
    school_start_time: z.string().optional(),
    school_dismissal_time: z.string().optional(),
    early_dismissal_notes: z.string().optional(),
    // Student needs — fixed: was z.string(), caused the error
    special_needs: z.boolean().optional(),
    booster_seat: z.string().optional(),
    no_adult_release: z.boolean().optional(),
    // Private PII — allowed through; server-side split handles routing
    parent_name: z.string().optional(),
    parent_phone: z.string().optional(),
    parent_email: z.string().optional(),
    guardian_name: z.string().optional(),
    guardian_phone: z.string().optional(),
    authorized_pickups: z.string().optional(),
    safe_word: z.string().optional(),
    note: z.string().optional(),
  }).refine((data) => {
    if (data.schedule_type === 'round-trip' || data.schedule_type === 'am-only') {
      return !!data.am_pickup_time;
    }
    return true;
  }, {
    message: 'AM pickup time is required for this schedule type',
    path: ['am_pickup_time'],
  }).refine((data) => {
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
});


// Medical service specific validation
export const medicalRequestSchema = baseRequestSchema.extend({
  service_type: z.literal('medical'),
  start_time: z.string().min(1, 'Appointment time is required'),
  metadata: z.object({
    patient_name: z.string().optional(),
    mobility_level: z.enum(['ambulatory', 'wheelchair', 'manual-wheelchair', 'electric-wheelchair', 'stretcher']),
    service_level: z.enum(['curb-to-curb', 'door-to-door', 'door-through-door', 'hand-to-hand']),
    trip_type: z.enum(['one-way', 'round-trip', 'wait-and-return']),
    appointment_time: z.string().min(1, 'Appointment time is required'),
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
    emergency_contact: z.string().optional(),
    emergency_phone: z.string().optional(),
    contact_email: z.string().optional(),
  }).refine((data) => {
    // If round-trip and fixed return, require return time
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
});

// Wedding service specific validation
export const weddingRequestSchema = baseRequestSchema.extend({
  service_type: z.literal('wedding'),
  start_time: z.string().min(1, 'Pickup time is required'),
  metadata: z.object({
    event_category: z.enum(['wedding', 'corporate', 'party', 'other']),
    guest_count: z.number().min(1, 'At least 1 guest is required').max(500),
    vehicle_style: z.enum(['shuttle', 'coach', 'limo', 'party-bus', 'school-bus', 'vintage']),
    itinerary_type: z.enum(['hotel-to-venue', 'venue-to-hotel', 'shuttle-service', 'full-day']),
    shuttle_mode: z.enum(['single-trip', 'continuous', 'end-of-night']).optional(),
    event_name: z.string().optional(),
    contact_name: z.string().optional(), // Made optional for guest/draft flow
    contact_phone: z.string().optional(),
    contact_email: z.string().optional(),
    pickup_time: z.string().min(1, 'Pickup time is required'),
    event_start_time: z.string().optional(),
    return_time: z.string().optional(),
    alcohol_allowed: z.boolean().optional(),
    refreshments_provided: z.boolean().optional(),
    av_needs: z.boolean().optional(),
    special_decor: z.boolean().optional(),
    special_requests: z.string().optional(),
    duration_hours: z.number().min(1).max(24).optional(),
    day_of_contact_name: z.string().optional(),
    day_of_contact_phone: z.string().optional(),
  }).refine((data) => {
    // If shuttle service or full day, require return time
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
});

// Union type for all request schemas
export const transportRequestSchema = z.discriminatedUnion('service_type', [
  schoolRequestSchema,
  medicalRequestSchema,
  weddingRequestSchema,
]);

// Type exports
export type SchoolRequest = z.infer<typeof schoolRequestSchema>;
export type MedicalRequest = z.infer<typeof medicalRequestSchema>;
export type WeddingRequest = z.infer<typeof weddingRequestSchema>;
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
]);

export type ApiRequest = z.infer<typeof apiRequestSchema>;
