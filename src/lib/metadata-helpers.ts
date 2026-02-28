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
  // Safe fields — visible to operators
  school_name?: string;
  grade_level?: string;
  student_count: number;
  student_age?: number;
  schedule_type: 'round-trip' | 'am-only' | 'pm-only';
  am_pickup_time?: string;
  pm_pickup_time?: string;
  school_recurring?: string;
  selected_days?: string;
  school_start_time?: string;
  school_dismissal_time?: string;
  early_dismissal_notes?: string;
  needs_wheelchair?: boolean;
  needs_car_seat?: boolean;
  booster_seat?: string;
  special_needs?: boolean;
  no_adult_release?: boolean;
  is_immediate?: boolean;
  note?: string;

  // Private fields — PII, never exposed to operators
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
  guardian_name?: string;
  guardian_phone?: string;
  authorized_pickups?: string;   // Who may receive student — PII
  safe_word?: string;            // Family security word — sensitive
}

export interface MedicalMetadata {
  // Safe fields
  mobility_level: 'ambulatory' | 'wheelchair' | 'manual-wheelchair' | 'electric-wheelchair' | 'stretcher';
  service_level: 'curb-to-curb' | 'door-to-door' | 'door-through-door' | 'hand-to-hand';
  trip_type: 'one-way' | 'round-trip' | 'wait-and-return';
  appointment_time: string;
  return_time?: string;
  return_status?: 'fixed' | 'will-call';
  special_equipment?: string;
  oxygen_required?: boolean;
  oxygen_use?: boolean;
  is_bariatric?: boolean;
  facility_details?: string;
  stair_factor?: 'none' | '1-5' | 'flight';
  additional_passengers?: number;
  service_animal?: boolean;
  attendant_needed?: boolean;
  medical_notes?: string;
  // Recurring ride date range (safe — no PII)
  medical_start_date?: string;
  medical_end_date?: string;
  is_immediate?: boolean;
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
  event_category?: 'wedding' | 'corporate' | 'party' | 'other';
  guest_count: number;
  vehicle_style: 'shuttle' | 'coach' | 'limo' | 'party-bus' | 'school-bus' | 'vintage';
  itinerary_type: 'hotel-to-venue' | 'venue-to-hotel' | 'shuttle-service' | 'full-day';
  shuttle_mode?: 'single-trip' | 'continuous' | 'end-of-night';
  event_duration_type?: 'single-day' | 'multi-day' | 'weekend' | 'custom';
  event_name?: string;
  pickup_time: string;
  event_start_time?: string;
  return_time?: string;
  alcohol_allowed?: boolean;
  refreshments_provided?: boolean;
  av_needs?: boolean;
  special_decor?: boolean;
  special_requests?: string;
  duration_hours?: number;
  service_level?: string;
  is_immediate?: boolean;
  note?: string;

  // Private fields
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  day_of_contact_name?: string;
  day_of_contact_phone?: string;
}

/**
 * Split school metadata into safe and private buckets.
 * PII fields (parent/guardian identity, authorized pickups, safe word)
 * are always moved to metadata_private.
 */
export function splitSchoolMetadata(metadata: SchoolMetadata) {
  const {
    parent_name,
    parent_phone,
    parent_email,
    guardian_name,
    guardian_phone,
    authorized_pickups,
    safe_word,
    ...safe
  } = metadata;

  return {
    metadata_safe: safe,
    metadata_private: {
      ...(parent_name && { parent_name }),
      ...(parent_phone && { parent_phone }),
      ...(parent_email && { parent_email }),
      ...(guardian_name && { guardian_name }),
      ...(guardian_phone && { guardian_phone }),
      ...(authorized_pickups && { authorized_pickups }),
      ...(safe_word && { safe_word }),
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
  const { contact_name, contact_phone, contact_email, day_of_contact_name, day_of_contact_phone, ...safe } = metadata;

  return {
    metadata_safe: safe,
    metadata_private: {
      contact_name,
      contact_phone,
      contact_email,
      ...(day_of_contact_name && { day_of_contact_name }),
      ...(day_of_contact_phone && { day_of_contact_phone }),
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
