-- Migration: Update metadata documentation and field expectations
-- This migration documents the expanded fields for all service types

-- Update comments for transport_requests to reflect the complete schema for all 3 service types
COMMENT ON COLUMN public.transport_requests.metadata_safe IS 
'Safe metadata fields visible to operators. Expected fields per service_type:

SCHOOL:
  - school_name: string
  - grade_level: string
  - student_count: number
  - student_age: number
  - schedule_type: "round-trip" | "am-only" | "pm-only"
  - school_recurring: "one-time" | "recurring"
  - selected_days: string (e.g. "M,T,W")
  - school_start_time: time string
  - school_dismissal_time: time string
  - early_dismissal_notes: string
  - am_pickup_time: time string
  - pm_pickup_time: time string
  - special_needs: boolean
  - booster_seat: "none" | "toddler" | "high-back" | "backless"
  - no_adult_release: boolean
  - specific_instructions: string
  - note: string

MEDICAL:
  - mobility_level: "ambulatory" | "manual-wheelchair" | "electric-wheelchair" | "stretcher"
  - service_level: "curb-to-curb" | "door-to-door" | "hand-to-hand"
  - facility_details: string (Room #, Suite, Wing)
  - stair_factor: "none" | "1-5" | "flight"
  - trip_type: "one-way" | "round-trip" | "wait-and-return"
  - return_status: "fixed" | "will-call"
  - appointment_time: time string
  - return_time: time string
  - oxygen_use: boolean
  - is_bariatric: boolean
  - service_animal: boolean
  - additional_passengers: number
  - medical_notes: string

WEDDING/EVENT:
  - event_category: "wedding" | "corporate" | "party" | "other"
  - guest_count: number
  - vehicle_style: "school-bus" | "shuttle" | "coach" | "limo" | "party-bus" | "vintage"
  - itinerary_type: "hotel-to-venue" | "venue-to-hotel" | "shuttle-service" | "full-day"
  - shuttle_mode: "single-trip" | "continuous" | "end-of-night"
  - event_start_time: time string (Ceremony start)
  - alcohol_allowed: boolean
  - refreshments_provided: boolean
  - av_needs: boolean
  - special_decor: boolean
  - note: string';

COMMENT ON COLUMN public.transport_requests.metadata_private IS 
'Private metadata (PII) hidden from operators. Expected fields per service_type:

SCHOOL:
  - parent_name, parent_email, parent_phone: string
  - guardian_name, guardian_phone: string
  - authorized_pickups: string
  - safe_word: string

MEDICAL:
  - patient_name: string
  - contact_name, contact_email, contact_phone: string
  - emergency_contact, emergency_phone: string

WEDDING/EVENT:
  - contact_name, contact_email, contact_phone: string
  - day_of_contact_name, day_of_contact_phone: string';
