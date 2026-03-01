-- Expand mock operator coverage for more diverse test situations
-- Focus on filling gaps: Boston School No-Adult Release, Worcester Medical Bariatric, RI Events, Framingham Mixed

-- 1. Boston Elite Student Travel (Boston School Specialist with No-Adult Release)
INSERT INTO public.operators (
    company_name, company_email, company_phone, company_address, 
    service_areas, service_radius_miles, is_verified, is_partner, 
    vehicle_types, rating, specialties, company_lat, company_lng
) VALUES (
    'Boston Elite Student Travel', 'sales@tabronai.com', '617-555-0901', '100 Federal St, Boston, MA 02110',
    ARRAY['MA'], 40, true, true,
    ARRAY['school_bus', 'van', 'mini_bus'], 4.9,
    ARRAY['School Routes', 'Special Needs', 'No-Adult Release', 'Booster Seat'],
    42.3555, -71.0565
) ON CONFLICT (company_name) DO NOTHING;

-- 2. Bay State Medical Logistics (Worcester Medical High-Care)
INSERT INTO public.operators (
    company_name, company_email, company_phone, company_address, 
    service_areas, service_radius_miles, is_verified, is_partner, 
    vehicle_types, rating, specialties, company_lat, company_lng
) VALUES (
    'Bay State Medical Logistics', 'support@tabronai.com', '508-555-0902', '100 Front St, Worcester, MA 01608',
    ARRAY['MA'], 50, true, true,
    ARRAY['van', 'wheelchair_van', 'sedan'], 4.7,
    ARRAY['Medical Transport', 'Wheelchair', 'Stretcher', 'Oxygen', 'Bariatric', 'White Glove'],
    42.2626, -71.8023
) ON CONFLICT (company_name) DO NOTHING;

-- 3. Ocean State Event Shuttles (Providence RI Specialist)
INSERT INTO public.operators (
    company_name, company_email, company_phone, company_address, 
    service_areas, service_radius_miles, is_verified, is_partner, 
    vehicle_types, rating, specialties, company_lat, company_lng
) VALUES (
    'Ocean State Event Shuttles', 'sales@tabronai.com', '401-555-0903', '1 Dorrance St, Providence, RI 02903',
    ARRAY['RI', 'MA', 'CT'], 60, true, false,
    ARRAY['coach', 'mini_bus', 'suv', 'limo'], 4.8,
    ARRAY['Event Shuttles', 'Alcohol OK', 'Custom Decor', 'AV/Bluetooth'],
    41.8240, -71.4128
) ON CONFLICT (company_name) DO NOTHING;

-- 4. MetroWest Care Connect (Framingham Mixed Provider)
INSERT INTO public.operators (
    company_name, company_email, company_phone, company_address, 
    service_areas, service_radius_miles, is_verified, is_partner, 
    vehicle_types, rating, specialties, company_lat, company_lng
) VALUES (
    'MetroWest Care Connect', 'support@tabronai.com', '508-555-0904', '150 Concord St, Framingham, MA 01702',
    ARRAY['MA'], 35, true, true,
    ARRAY['van', 'wheelchair_van', 'school_bus'], 4.6,
    ARRAY['Medical Transport', 'Wheelchair', 'School Routes', 'Special Needs'],
    42.2793, -71.4162
) ON CONFLICT (company_name) DO NOTHING;
