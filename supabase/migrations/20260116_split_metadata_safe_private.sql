-- Split metadata into safe and private JSONB fields
-- This migration enforces architectural boundary between operator-visible and PII data

-- Add new columns
ALTER TABLE public.transport_requests
  ADD COLUMN metadata_safe JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN metadata_private JSONB DEFAULT '{}'::jsonb;

-- Migrate existing metadata to safe/private split
-- For school service: safe fields include schedule_type, student_count, needs_wheelchair, needs_car_seat, special_requirements
UPDATE public.transport_requests
SET 
  metadata_safe = jsonb_build_object(
    'schedule_type', metadata->>'schedule_type',
    'student_count', metadata->>'student_count',
    'needs_wheelchair', metadata->'needs_wheelchair',
    'needs_car_seat', metadata->'needs_car_seat',
    'special_requirements', metadata->>'special_requirements'
  ),
  metadata_private = jsonb_build_object(
    'parent_email', metadata->>'parent_email',
    'parent_phone', metadata->>'parent_phone',
    'parent_name', metadata->>'parent_name'
  )
WHERE service_type = 'school' AND metadata IS NOT NULL;

-- For medical service: safe fields include mobility_level, medical_equipment, appointment_type
UPDATE public.transport_requests
SET 
  metadata_safe = jsonb_build_object(
    'mobility_level', metadata->>'mobility_level',
    'medical_equipment', metadata->>'medical_equipment',
    'appointment_type', metadata->>'appointment_type',
    'special_requirements', metadata->>'special_requirements'
  ),
  metadata_private = jsonb_build_object(
    'patient_name', metadata->>'patient_name',
    'contact_email', metadata->>'contact_email',
    'contact_phone', metadata->>'contact_phone',
    'contact_name', metadata->>'contact_name'
  )
WHERE service_type = 'medical' AND metadata IS NOT NULL;

-- For wedding service: safe fields include guest_count, service_level, vehicle_style, special_requests
UPDATE public.transport_requests
SET 
  metadata_safe = jsonb_build_object(
    'guest_count', metadata->>'guest_count',
    'service_level', metadata->>'service_level',
    'vehicle_style', metadata->>'vehicle_style',
    'special_requests', metadata->>'special_requests'
  ),
  metadata_private = jsonb_build_object(
    'contact_email', metadata->>'contact_email',
    'contact_phone', metadata->>'contact_phone',
    'contact_name', metadata->>'contact_name'
  )
WHERE service_type = 'wedding' AND metadata IS NOT NULL;

-- For corporate service: safe fields similar to wedding
UPDATE public.transport_requests
SET 
  metadata_safe = jsonb_build_object(
    'passenger_count', metadata->>'passenger_count',
    'service_level', metadata->>'service_level',
    'vehicle_style', metadata->>'vehicle_style',
    'special_requests', metadata->>'special_requests'
  ),
  metadata_private = jsonb_build_object(
    'contact_email', metadata->>'contact_email',
    'contact_phone', metadata->>'contact_phone',
    'contact_name', metadata->>'contact_name',
    'company_name', metadata->>'company_name'
  )
WHERE service_type = 'corporate' AND metadata IS NOT NULL;

-- Clean up null values from JSONB objects
UPDATE public.transport_requests
SET metadata_safe = (
  SELECT jsonb_object_agg(key, value)
  FROM jsonb_each(metadata_safe)
  WHERE value IS NOT NULL AND value::text != 'null'
)
WHERE metadata_safe IS NOT NULL;

UPDATE public.transport_requests
SET metadata_private = (
  SELECT jsonb_object_agg(key, value)
  FROM jsonb_each(metadata_private)
  WHERE value IS NOT NULL AND value::text != 'null'
)
WHERE metadata_private IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.transport_requests.metadata_safe IS 
  'Safe metadata fields visible to operators (schedule details, requirements, preferences)';
COMMENT ON COLUMN public.transport_requests.metadata_private IS 
  'Private metadata containing PII (contact info, names, emails, phones) - server-side only';

-- Note: metadata column is kept for backward compatibility during transition
-- Consider dropping it in a future migration after verifying all code paths use split fields
COMMENT ON COLUMN public.transport_requests.metadata IS 
  'DEPRECATED: Use metadata_safe and metadata_private instead. Kept for backward compatibility.';
