-- Migration: add_rapid_response_operator
-- Description: Adds the Boston Rapid Response Transit as a global fallback partner.

INSERT INTO public.operators (
  company_name,
  company_email,
  company_phone,
  service_radius_miles,
  is_partner,
  is_verified,
  is_active,
  rating,
  total_vehicles,
  vehicle_types,
  specialties,
  base_rate_per_mile,
  minimum_charge
) VALUES (
  'Boston Rapid Response Transit',
  'support@tabronai.com',
  '(617) 555-0199',
  150,
  true,
  true,
  true,
  4.9,
  25,
  ARRAY['van', 'wheelchair_van', 'sedan', 'suv', 'mini_bus', 'school_bus'],
  ARRAY['Medical Transport','Wheelchair','Stretcher','Oxygen','Bariatric','Door-Through-Door','Service Animal','Immediate Availability','School Routes','Special Needs','Event Shuttles'],
  2.50,
  45.00
) ON CONFLICT (company_name) DO UPDATE SET
  is_partner = EXCLUDED.is_partner,
  service_radius_miles = EXCLUDED.service_radius_miles,
  specialties = EXCLUDED.specialties;
