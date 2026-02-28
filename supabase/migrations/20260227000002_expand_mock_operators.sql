-- Mock Operators Expansion: Diverse Services & Locations (Corrected Schema)

-- 1. Create a specialized Medical Operator in Rhode Island
-- Focus: Bariatric, Oxygen, Stretcher
INSERT INTO public.operators (
  company_name, company_email, company_phone, company_address, 
  company_lat, company_lng, service_radius_miles, specialties, is_verified, is_partner
) VALUES (
  'Providence Care Trans', 'ops@provcare.test', '401-555-0123', '100 Westminster St, Providence, RI 02903', 
  41.8240, -71.4128, 62, -- ~100km in miles
  ARRAY['Medical Transport', 'Wheelchair', 'Stretcher', 'Oxygen', 'Bariatric', 'Door-Through-Door'], 
  TRUE, TRUE
);

-- 2. Create a specialized Wedding/Event Operator in New Hampshire
-- Focus: Limo, Party Bus, Luxury amenities
INSERT INTO public.operators (
  company_name, company_email, company_phone, company_address, 
  company_lat, company_lng, service_radius_miles, specialties, is_verified, is_partner
) VALUES (
  'White Mountain Limos', 'bookings@whitemtn.test', '603-555-0456', '1 Bicentennial Sq, Concord, NH 03301', 
  43.2081, -71.5375, 93, -- ~150km in miles
  ARRAY['Event Shuttles', 'Alcohol OK', 'Refreshments', 'AV/Bluetooth', 'Custom Decor'], 
  TRUE, FALSE
);

-- 3. Create a unique School Operator in Western MA (Springfield)
-- Focus: No-Adult Release, Special Needs
INSERT INTO public.operators (
  company_name, company_email, company_phone, company_address, 
  company_lat, company_lng, service_radius_miles, specialties, is_verified, is_partner
) VALUES (
  'Springfield Student Transit', 'info@springfieldbus.test', '413-555-0789', '1 Monarch Pl, Springfield, MA 01144', 
  42.1015, -72.5898, 31, -- ~50km in miles
  ARRAY['School Routes', 'Special Needs', 'No-Adult Release', 'Booster Seat'], 
  TRUE, TRUE
);

-- Add unique vehicles for these new operators

-- Vehicles for Providence Care Trans (RI) - Stretcher/Bariatric
INSERT INTO public.operator_vehicles (
  operator_id, vehicle_type, make, model, year, color, license_plate, 
  passenger_capacity, wheelchair_capacity, wheelchair_accessible, is_active
) 
SELECT id, 'wheelchair_van', 'Ford', 'Transit 350 Bariatric', 2024, 'Blue', 'RI-MED-777', 4, 1, TRUE, TRUE
FROM public.operators WHERE company_name = 'Providence Care Trans';

-- Vehicles for White Mountain Limos (NH) - Limo & Party Bus
INSERT INTO public.operator_vehicles (
  operator_id, vehicle_type, make, model, year, color, license_plate, 
  passenger_capacity, wheelchair_capacity, wheelchair_accessible, is_active
) 
SELECT id, 'limo', 'Lincoln', 'Navigator Stretch', 2023, 'White', 'NH-LIMO-1', 12, 0, FALSE, TRUE
FROM public.operators WHERE company_name = 'White Mountain Limos';

INSERT INTO public.operator_vehicles (
  operator_id, vehicle_type, make, model, year, color, license_plate, 
  passenger_capacity, wheelchair_capacity, wheelchair_accessible, is_active
) 
SELECT id, 'party_bus', 'Freightliner', 'M2 Luxury Party Bus', 2024, 'Black', 'NH-PARTY-1', 35, 0, FALSE, TRUE
FROM public.operators WHERE company_name = 'White Mountain Limos';

-- Vehicles for Springfield Student Transit (MA) - Special Needs Bus
INSERT INTO public.operator_vehicles (
  operator_id, vehicle_type, make, model, year, color, license_plate, 
  passenger_capacity, wheelchair_capacity, wheelchair_accessible, is_active
) 
SELECT id, 'school_bus', 'Thomas Built', 'Minotour Special Needs', 2022, 'Yellow', 'MA-SCH-999', 15, 4, TRUE, TRUE
FROM public.operators WHERE company_name = 'Springfield Student Transit';
