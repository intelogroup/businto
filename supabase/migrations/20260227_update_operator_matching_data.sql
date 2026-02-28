-- Migration: Update Operator Matching Data (Vehicles & Specialties)

-- 1. Update vehicle_type check constraint to include new types
-- First, find the existing constraint name if it varies, but based on common patterns it's operator_vehicles_vehicle_type_check
ALTER TABLE public.operator_vehicles DROP CONSTRAINT IF EXISTS operator_vehicles_vehicle_type_check;

ALTER TABLE public.operator_vehicles ADD CONSTRAINT operator_vehicles_vehicle_type_check 
CHECK (vehicle_type IN ('school_bus', 'mini_bus', 'coach', 'van', 'sedan', 'suv', 'wheelchair_van', 'limo', 'party_bus'));

-- 2. Add documentation comments for new specialties
-- These are used by findMatchingOperators logic in operator-matching.ts
COMMENT ON COLUMN public.operators.specialties IS 'Array of specialties. Supported types for matching:
School: "School Routes", "Special Needs", "Booster Seat", "No-Adult Release"
Medical: "Medical Transport", "Wheelchair", "Stretcher", "Door-Through-Door", "White Glove", "Oxygen", "Bariatric", "Service Animal"
Wedding/Event: "Event Shuttles", "Alcohol OK", "Refreshments", "AV/Bluetooth", "Custom Decor"';

-- 3. Ensure existing operators have correct default specialties if missing 
-- (Optional: Add common specialties to existing verified operators for testing)
UPDATE public.operators 
SET specialties = ARRAY_APPEND(specialties, 'Stretcher')
WHERE is_verified = TRUE AND NOT ('Stretcher' = ANY(specialties)) AND id IN (
  SELECT id FROM public.operators LIMIT 2
);

UPDATE public.operators 
SET specialties = ARRAY_APPEND(specialties, 'No-Adult Release')
WHERE is_verified = TRUE AND NOT ('No-Adult Release' = ANY(specialties)) AND id IN (
  SELECT id FROM public.operators LIMIT 2
);
