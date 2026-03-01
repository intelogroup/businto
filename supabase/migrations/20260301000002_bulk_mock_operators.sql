-- Bulk expansion of mock operator coverage (20 additional operators)
-- Coverage: MA, CT, NH, RI
-- Types: School, Medical, Wedding, Corporate

INSERT INTO public.operators (
    company_name, company_email, company_phone, company_address, 
    service_areas, service_radius_miles, is_verified, is_active, is_accepting_requests, is_partner, 
    vehicle_types, rating, specialties, company_lat, company_lng
) VALUES 
-- 1. Cambridge Scholar Shuttles
(
    'Cambridge Scholar Shuttles', 'sales@tabronai.com', '617-555-1001', '1 Main St, Cambridge, MA 02142',
    ARRAY['MA'], 25, true, true, true, true,
    ARRAY['van', 'mini_bus'], 4.8, ARRAY['School Routes', 'After School Programs', 'No-Adult Release'],
    42.3626, -71.0843
),
-- 2. North Shore Care Ride
(
    'North Shore Care Ride', 'support@tabronai.com', '978-555-1002', '100 Washington St, Salem, MA 01970',
    ARRAY['MA'], 45, true, true, true, false,
    ARRAY['wheelchair_van', 'sedan'], 4.6, ARRAY['Medical Transport', 'Wheelchair', 'Door-Through-Door'],
    42.5195, -70.8967
),
-- 3. Berkshire Event Transit
(
    'Berkshire Event Transit', 'sales@tabronai.com', '413-555-1003', '1 North St, Pittsfield, MA 01201',
    ARRAY['MA', 'NY', 'VT'], 75, true, true, true, true,
    ARRAY['coach', 'suv', 'limo'], 4.9, ARRAY['Event Shuttles', 'Alcohol OK', 'AV/Bluetooth'],
    42.4501, -73.2455
),
-- 4. Cape Cod Medical Express
(
    'Cape Cod Medical Express', 'support@tabronai.com', '508-555-1004', '200 Main St, Hyannis, MA 02601',
    ARRAY['MA'], 60, true, true, true, true,
    ARRAY['van', 'sedan'], 4.7, ARRAY['Medical Transport', 'Oxygen', 'Long Distance'],
    41.6521, -70.2821
),
-- 5. Lowell Youth Transport
(
    'Lowell Youth Transport', 'sales@tabronai.com', '978-555-1005', '50 Merrimack St, Lowell, MA 01852',
    ARRAY['MA', 'NH'], 30, true, true, true, false,
    ARRAY['school_bus'], 4.5, ARRAY['School Routes', 'Sports Teams', 'Field Trips'],
    42.6411, -71.3134
),
-- 6. Quincy Corporate Coaches
(
    'Quincy Corporate Coaches', 'sales@tabronai.com', '617-555-1006', '1 Hancock St, Quincy, MA 02169',
    ARRAY['MA'], 40, true, true, true, true,
    ARRAY['coach', 'mini_bus', 'sedan'], 4.8, ARRAY['Corporate Travel', 'Airport Transfer', 'Executive'],
    42.2529, -71.0023
),
-- 7. New Haven Care Connect
(
    'New Haven Care Connect', 'support@tabronai.com', '203-555-1007', '1 Church St, New Haven, CT 06510',
    ARRAY['CT', 'NY'], 50, true, true, true, true,
    ARRAY['wheelchair_van', 'stretcher_van'], 4.7, ARRAY['Medical Transport', 'Wheelchair', 'Stretcher', 'Oxygen'],
    41.3083, -72.9279
),
-- 8. Hartford Student Line
(
    'Hartford Student Line', 'sales@tabronai.com', '860-555-1008', '100 Pearl St, Hartford, CT 06103',
    ARRAY['CT', 'MA'], 40, true, true, true, false,
    ARRAY['school_bus', 'van'], 4.4, ARRAY['School Routes', 'Special Needs', 'No-Adult Release'],
    41.7658, -72.6734
),
-- 9. Manchester Outbreak Shuttles
(
    'Manchester Outbreak Shuttles', 'support@tabronai.com', '603-555-1009', '1000 Elm St, Manchester, NH 03101',
    ARRAY['NH', 'MA'], 55, true, true, true, true,
    ARRAY['van', 'mini_bus'], 4.6, ARRAY['Medical Transport', 'Immediate Availability', 'Infection Control'],
    42.9956, -71.4548
),
-- 10. Seacoast Wedding Wheels
(
    'Seacoast Wedding Wheels', 'sales@tabronai.com', '603-555-1010', '1 Congress St, Portsmouth, NH 03801',
    ARRAY['NH', 'ME', 'MA'], 65, true, true, true, false,
    ARRAY['coach', 'party_bus', 'limo'], 4.9, ARRAY['Event Shuttles', 'Custom Decor', 'Refreshments'],
    43.0718, -70.7626
),
-- 11. Merrimack Valley Med-Trans
(
    'Merrimack Valley Med-Trans', 'support@tabronai.com', '978-555-1011', '1 Common St, Lawrence, MA 01840',
    ARRAY['MA', 'NH'], 35, true, true, true, true,
    ARRAY['wheelchair_van', 'sedan'], 4.7, ARRAY['Medical Transport', 'Bariatric', 'Wheelchair'],
    42.7070, -71.1631
),
-- 12. South Shore Student Link
(
    'South Shore Student Link', 'sales@tabronai.com', '508-555-1012', '1 Town Sq, Plymouth, MA 02360',
    ARRAY['MA'], 40, true, true, true, true,
    ARRAY['van', 'school_bus'], 4.8, ARRAY['School Routes', 'Booster Seat', 'After School Programs'],
    41.9584, -70.6673
),
-- 13. Central Mass Corporate Travel
(
    'Central Mass Corporate Travel', 'sales@tabronai.com', '508-555-1013', '1 Exchange Pl, Worcester, MA 01608',
    ARRAY['MA'], 50, true, true, true, false,
    ARRAY['sedan', 'suv', 'mini_bus'], 4.7, ARRAY['Corporate Travel', 'Executive', 'Wi-Fi'],
    42.2626, -71.8023
),
-- 14. Rhode Island Recovery Rides
(
    'Rhode Island Recovery Rides', 'support@tabronai.com', '401-555-1014', '1 Post Rd, Warwick, RI 02886',
    ARRAY['RI', 'CT'], 45, true, true, true, true,
    ARRAY['van', 'wheelchair_van'], 4.6, ARRAY['Medical Transport', 'Wheelchair', 'Door-Through-Door'],
    41.7001, -71.4333
),
-- 15. Newport Luxury Shuttles
(
    'Newport Luxury Shuttles', 'sales@tabronai.com', '401-555-1015', '1 Thames St, Newport, RI 02840',
    ARRAY['RI', 'MA'], 50, true, true, true, true,
    ARRAY['limo', 'coach', 'suv'], 5.0, ARRAY['Event Shuttles', 'White Glove', 'AV/Bluetooth'],
    41.4901, -71.3128
),
-- 16. Pioneer Valley School Bus
(
    'Pioneer Valley School Bus', 'sales@tabronai.com', '413-555-1016', '1 Amity St, Amherst, MA 01002',
    ARRAY['MA'], 40, true, true, true, false,
    ARRAY['school_bus'], 4.5, ARRAY['School Routes', 'Special Needs', 'No-Adult Release'],
    42.3732, -72.5199
),
-- 17. Route 128 Business Shuttles
(
    'Route 128 Business Shuttles', 'sales@tabronai.com', '781-555-1017', '1 Main St, Waltham, MA 02453',
    ARRAY['MA'], 30, true, true, true, true,
    ARRAY['mini_bus', 'van', 'sedan'], 4.8, ARRAY['Corporate Travel', 'Employee Commute', 'Wi-Fi'],
    42.3765, -71.2356
),
-- 18. Wachusett Special Needs
(
    'Wachusett Special Needs', 'support@tabronai.com', '508-555-1018', '1 Main St, Holden, MA 01520',
    ARRAY['MA'], 35, true, true, true, true,
    ARRAY['wheelchair_van', 'van'], 4.9, ARRAY['Special Needs', 'Medical Transport', 'Wheelchair'],
    42.3515, -71.8637
),
-- 19. Mystic Valley Medical
(
    'Mystic Valley Medical', 'support@tabronai.com', '781-555-1019', '1 Main St, Medford, MA 02155',
    ARRAY['MA'], 25, true, true, true, false,
    ARRAY['wheelchair_van', 'sedan'], 4.7, ARRAY['Medical Transport', 'Stretcher', 'Oxygen'],
    42.4184, -71.1062
),
-- 20. Gillette Stadium Event Shuttles
(
    'Gillette Stadium Event Shuttles', 'sales@tabronai.com', '508-555-1020', '1 Patriot Pl, Foxboro, MA 02035',
    ARRAY['MA', 'RI'], 100, true, true, true, true,
    ARRAY['coach', 'mini_bus', 'van'], 4.8, ARRAY['Event Shuttles', 'High Capacity', 'Alcohol OK'],
    42.0909, -71.2643
)
ON CONFLICT (company_name) DO UPDATE 
SET 
    is_verified = EXCLUDED.is_verified,
    is_active = EXCLUDED.is_active,
    is_accepting_requests = EXCLUDED.is_accepting_requests,
    is_partner = EXCLUDED.is_partner,
    specialties = EXCLUDED.specialties;
