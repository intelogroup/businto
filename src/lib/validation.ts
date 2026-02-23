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
    school_name: z.string().optional(), // Made optional for dev mode
    grade_level: z.string().min(1, 'Grade level is required'),
    student_count: z.number().min(1, 'At least 1 student is required').max(100),
    schedule_type: z.enum(['round-trip', 'am-only', 'pm-only']),
    am_pickup_time: z.string().optional(),
    pm_pickup_time: z.string().optional(),
    special_needs: z.string().optional(),
    parent_name: z.string().optional(),
    parent_phone: z.string().optional(),
    duration_type: z.enum(['daily', 'weekly', 'monthly', 'semester', 'custom']),
  }).refine((data) => {
    // If schedule includes AM, require AM time
    if (data.schedule_type === 'round-trip' || data.schedule_type === 'am-only') {
      return !!data.am_pickup_time;
    }
    return true;
  }, {
    message: 'AM pickup time is required for this schedule type',
    path: ['am_pickup_time'],
  }).refine((data) => {
    // If schedule includes PM, require PM time
    if (data.schedule_type === 'round-trip' || data.schedule_type === 'pm-only') {
      return !!data.pm_pickup_time;
    }
    return true;
  }, {
    message: 'PM pickup time is required for this schedule type',
    path: ['pm_pickup_time'],
  }),
});

// Medical service specific validation
export const medicalRequestSchema = baseRequestSchema.extend({
  service_type: z.literal('medical'),
  start_time: z.string().min(1, 'Appointment time is required'),
  metadata: z.object({
    patient_name: z.string().optional(), // Made optional for dev mode
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
    emergency_contact: z.string().optional(),
    emergency_phone: z.string().optional(),
  }).refine((data) => {
    // If round-trip or wait-and-return, require return time
    if (data.trip_type === 'round-trip' || data.trip_type === 'wait-and-return') {
      return !!data.return_time;
    }
    return true;
  }, {
    message: 'Return time is required for round-trip or wait-and-return service',
    path: ['return_time'],
  }),
});

// Wedding service specific validation
export const weddingRequestSchema = baseRequestSchema.extend({
  service_type: z.literal('wedding'),
  start_time: z.string().min(1, 'Pickup time is required'),
  metadata: z.object({
    guest_count: z.number().min(1, 'At least 1 guest is required').max(500),
    vehicle_style: z.enum(['shuttle', 'coach', 'limo', 'party-bus']),
    itinerary_type: z.enum(['hotel-to-venue', 'venue-to-hotel', 'shuttle-service', 'full-day']),
    event_name: z.string().optional(),
    contact_name: z.string().min(1, 'Contact name is required'),
    contact_phone: z.string().min(1, 'Contact phone is required'),
    contact_email: z.string().email('Valid email is required'),
    pickup_time: z.string().min(1, 'Pickup time is required'),
    return_time: z.string().optional(),
    special_requests: z.string().optional(),
    duration_hours: z.number().min(1).max(24).optional(),
  }).refine((data) => {
    // If shuttle service or full day, require return time
    if (data.itinerary_type === 'shuttle-service' || data.itinerary_type === 'full-day') {
      return !!data.return_time;
    }
    return true;
  }, {
    message: 'Return time is required for shuttle service or full-day rental',
    path: ['return_time'],
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
