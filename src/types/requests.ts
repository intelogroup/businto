/**
 * Type definitions for transport requests and metadata
 * 
 * These types enforce the architectural boundary between operator-visible
 * data and private parent information.
 */

// Base service types
export type ServiceType = 'school' | 'medical' | 'wedding' | 'corporate';

// ============================================================================
// SAFE METADATA - Visible to operators
// ============================================================================

export interface SchoolSafeMetadata {
  school_name?: string;
  grade_level: string;
  student_count: number;
  schedule_type: 'round-trip' | 'am-only' | 'pm-only';
  am_pickup_time?: string;
  pm_pickup_time?: string;
  special_needs?: string;
  duration_type: 'daily' | 'weekly' | 'monthly' | 'semester' | 'custom';
  needs_wheelchair?: boolean;
  needs_car_seat?: boolean;
  special_requirements?: string;
  note?: string;
}

export interface MedicalSafeMetadata {
  mobility_level: 'ambulatory' | 'wheelchair' | 'stretcher';
  service_level: 'curb-to-curb' | 'door-to-door' | 'door-through-door';
  trip_type: 'one-way' | 'round-trip' | 'wait-and-return';
  appointment_time: string;
  return_time?: string;
  special_equipment?: string;
  oxygen_required?: boolean;
  wheelchair_type?: string;
  attendant_needed?: boolean;
  medical_notes?: string;
  note?: string;
}

export interface WeddingSafeMetadata {
  guest_count: number;
  vehicle_style: 'shuttle' | 'coach' | 'limo' | 'party-bus';
  itinerary_type: 'hotel-to-venue' | 'venue-to-hotel' | 'shuttle-service' | 'full-day';
  event_name?: string;
  pickup_time: string;
  return_time?: string;
  special_requests?: string;
  duration_hours?: number;
  service_level?: string;
  note?: string;
}

export interface CorporateSafeMetadata {
  employee_count: number;
  trip_purpose: 'airport' | 'event' | 'shuttle' | 'executive';
  vehicle_style: 'sedan' | 'suv' | 'van' | 'shuttle';
  service_level: 'standard' | 'premium' | 'executive';
  return_trip?: boolean;
  special_requests?: string;
  note?: string;
}

// Union type for all safe metadata
export type SafeMetadata = 
  | SchoolSafeMetadata 
  | MedicalSafeMetadata 
  | WeddingSafeMetadata 
  | CorporateSafeMetadata;

// ============================================================================
// PRIVATE METADATA - PII, server-side only
// ============================================================================

export interface SchoolPrivateMetadata {
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
}

export interface MedicalPrivateMetadata {
  patient_name?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  emergency_contact?: string;
  emergency_phone?: string;
}

export interface WeddingPrivateMetadata {
  contact_name: string;
  contact_phone: string;
  contact_email: string;
}

export interface CorporatePrivateMetadata {
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  billing_contact?: string;
  billing_email?: string;
}

// Union type for all private metadata
export type PrivateMetadata = 
  | SchoolPrivateMetadata 
  | MedicalPrivateMetadata 
  | WeddingPrivateMetadata 
  | CorporatePrivateMetadata;

// ============================================================================
// OPERATOR VIEW DTO - What operators can see
// ============================================================================

export interface OperatorRequestView {
  id: string;
  service_type: ServiceType;
  pickup_fuzzy: string;
  dropoff_fuzzy: string;
  start_date: string;
  start_time?: string;
  end_date?: string;
  is_recurring: boolean;
  recurrence_pattern?: string;
  metadata_safe: SafeMetadata;
  status: string;
  created_at: string;
}

// ============================================================================
// FULL REQUEST - Server-side only
// ============================================================================

export interface TransportRequest {
  id: string;
  user_id?: string;
  service_type: ServiceType;
  
  // Exact addresses - server-side only
  pickup_address: string;
  dropoff_address: string;
  
  // Fuzzy locations - operator-visible
  pickup_fuzzy: string;
  dropoff_fuzzy: string;
  
  // Geographic coordinates
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
  
  // Schedule
  start_date: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  is_recurring: boolean;
  recurrence_pattern?: string;
  
  // Metadata split
  metadata_safe: SafeMetadata;
  metadata_private: PrivateMetadata;
  
  // Legacy field for backward compatibility
  metadata?: Record<string, any>;
  
  // Status
  status: 'pending' | 'quoted' | 'booked' | 'in-progress' | 'completed' | 'cancelled';
  
  // Timestamps
  created_at: string;
  updated_at?: string;
}

// ============================================================================
// REQUEST CREATION PAYLOAD
// ============================================================================

export interface CreateTransportRequestPayload {
  service_type: ServiceType;
  pickup_address: string;
  dropoff_address: string;
  pickup_fuzzy: string;
  dropoff_fuzzy: string;
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
  start_date: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  is_recurring: boolean;
  recurrence_pattern?: string;
  
  // Can send pre-split metadata
  metadata_safe?: SafeMetadata;
  metadata_private?: PrivateMetadata;
  
  // Or send combined (server will split)
  metadata?: Record<string, any>;
}
