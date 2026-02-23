/**
 * Client-side metadata preparation helpers
 * 
 * These functions help forms categorize metadata fields into safe (operator-visible)
 * and private (PII) buckets before submission.
 * 
 * Note: Server-side validation is the final authority. These helpers are for
 * clean separation at the client level.
 */

export interface SchoolMetadata {
  // Safe fields
  school_name?: string;
  grade_level: string;
  student_count: number;
  schedule_type: 'round-trip' | 'am-only' | 'pm-only';
  am_pickup_time?: string;
  pm_pickup_time?: string;
  duration_type: 'daily' | 'weekly' | 'monthly' | 'semester' | 'custom';
  needs_wheelchair?: boolean;
  needs_car_seat?: boolean;
  special_requirements?: string;
  note?: string;
  
  // Private fields
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
}

export interface MedicalMetadata {
  // Safe fields
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
  
  // Private fields
  patient_name?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  emergency_contact?: string;
  emergency_phone?: string;
}

export interface WeddingMetadata {
  // Safe fields
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
  
  // Private fields
  contact_name: string;
  contact_phone: string;
  contact_email: string;
}

/**
 * Split school metadata into safe and private buckets
 */
export function splitSchoolMetadata(metadata: SchoolMetadata) {
  const { parent_name, parent_phone, parent_email, ...safe } = metadata;
  
  return {
    metadata_safe: safe,
    metadata_private: {
      ...(parent_name && { parent_name }),
      ...(parent_phone && { parent_phone }),
      ...(parent_email && { parent_email }),
    },
  };
}

/**
 * Split medical metadata into safe and private buckets
 */
export function splitMedicalMetadata(metadata: MedicalMetadata) {
  const { 
    patient_name, 
    contact_name, 
    contact_phone, 
    contact_email, 
    emergency_contact, 
    emergency_phone,
    ...safe 
  } = metadata;
  
  return {
    metadata_safe: safe,
    metadata_private: {
      ...(patient_name && { patient_name }),
      ...(contact_name && { contact_name }),
      ...(contact_phone && { contact_phone }),
      ...(contact_email && { contact_email }),
      ...(emergency_contact && { emergency_contact }),
      ...(emergency_phone && { emergency_phone }),
    },
  };
}

/**
 * Split wedding metadata into safe and private buckets
 */
export function splitWeddingMetadata(metadata: WeddingMetadata) {
  const { contact_name, contact_phone, contact_email, ...safe } = metadata;
  
  return {
    metadata_safe: safe,
    metadata_private: {
      contact_name,
      contact_phone,
      contact_email,
    },
  };
}

/**
 * Generic metadata splitter based on service type
 */
export function splitMetadataByServiceType(
  serviceType: 'school' | 'medical' | 'wedding',
  metadata: any
) {
  switch (serviceType) {
    case 'school':
      return splitSchoolMetadata(metadata);
    case 'medical':
      return splitMedicalMetadata(metadata);
    case 'wedding':
      return splitWeddingMetadata(metadata);
    default:
      // Fallback: keep everything in safe (server will validate)
      return { metadata_safe: metadata, metadata_private: {} };
  }
}
