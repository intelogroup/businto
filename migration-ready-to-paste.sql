-- ============================================
-- OPERATORS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.operators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Profile reference
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Company details
    company_name TEXT NOT NULL,
    company_email TEXT NOT NULL,
    company_phone TEXT NOT NULL,
    company_address TEXT,
    company_logo_url TEXT,
    
    -- Business info
    years_in_business INTEGER,
    license_number TEXT,
    dot_number TEXT,
    ein TEXT,
    
    -- Service areas (array of states or regions)
    service_areas TEXT[] DEFAULT '{}',
    service_radius_miles INTEGER DEFAULT 50,
    
    -- Verification status
    is_verified BOOLEAN DEFAULT FALSE,
    cori_verified BOOLEAN DEFAULT FALSE,
    insurance_verified BOOLEAN DEFAULT FALSE,
    background_check_date DATE,
    insurance_expiry DATE,
    
    -- Fleet information
    total_vehicles INTEGER DEFAULT 0,
    vehicle_types TEXT[] DEFAULT '{}', -- ['school_bus', 'mini_bus', 'coach', 'van']
    
    -- Ratings and performance
    rating DECIMAL(3,2) DEFAULT 0,
    total_reviews INTEGER DEFAULT 0,
    total_trips INTEGER DEFAULT 0,
    response_time_avg_mins INTEGER DEFAULT 0,
    acceptance_rate DECIMAL(5,2) DEFAULT 0,
    
    -- Pricing
    base_rate_per_mile DECIMAL(10,2),
    minimum_charge DECIMAL(10,2),
    
    -- Availability
    is_active BOOLEAN DEFAULT TRUE,
    is_accepting_requests BOOLEAN DEFAULT TRUE,
    
    -- About
    description TEXT,
    specialties TEXT[],
    certifications TEXT[],
    
    UNIQUE(company_name)
);

CREATE INDEX idx_operators_verified ON public.operators(is_verified);
CREATE INDEX idx_operators_active ON public.operators(is_active);
CREATE INDEX idx_operators_rating ON public.operators(rating DESC);
CREATE INDEX idx_operators_service_areas ON public.operators USING GIN(service_areas);

-- ============================================
-- OPERATOR VEHICLES
-- ============================================
CREATE TABLE IF NOT EXISTS public.operator_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
    
    -- Vehicle details
    vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('school_bus', 'mini_bus', 'coach', 'van', 'sedan', 'suv', 'wheelchair_van')),
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    color TEXT,
    license_plate TEXT,
    vin TEXT,
    
    -- Capacity
    passenger_capacity INTEGER NOT NULL,
    wheelchair_capacity INTEGER DEFAULT 0,
    luggage_capacity INTEGER,
    
    -- Features
    has_wifi BOOLEAN DEFAULT FALSE,
    has_ac BOOLEAN DEFAULT TRUE,
    has_tv BOOLEAN DEFAULT FALSE,
    has_restroom BOOLEAN DEFAULT FALSE,
    wheelchair_accessible BOOLEAN DEFAULT FALSE,
    has_car_seats BOOLEAN DEFAULT FALSE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_inspection_date DATE,
    insurance_expiry DATE,
    
    -- Media
    photo_urls TEXT[] DEFAULT '{}',
    
    UNIQUE(license_plate)
);

CREATE INDEX idx_vehicles_operator ON public.operator_vehicles(operator_id);
CREATE INDEX idx_vehicles_type ON public.operator_vehicles(vehicle_type);
CREATE INDEX idx_vehicles_active ON public.operator_vehicles(is_active);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_vehicles ENABLE ROW LEVEL SECURITY;

-- Operators: public can read active verified operators, operators can update own
CREATE POLICY "Anyone can view verified operators" ON public.operators FOR SELECT USING (is_verified = TRUE AND is_active = TRUE);
CREATE POLICY "Operators can view own profile" ON public.operators FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND id = profile_id)
);
CREATE POLICY "Operators can update own profile" ON public.operators FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND id = profile_id)
);

-- Vehicles: public can see vehicles of verified operators
CREATE POLICY "Anyone can view vehicles of verified operators" ON public.operator_vehicles FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.operators WHERE id = operator_id AND is_verified = TRUE AND is_active = TRUE)
);
CREATE POLICY "Operators can manage own vehicles" ON public.operator_vehicles FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.operators o
        INNER JOIN public.profiles p ON p.id = o.profile_id
        WHERE o.id = operator_id AND p.id = auth.uid()
    )
);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE TRIGGER update_operators_updated_at BEFORE UPDATE ON public.operators
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
    
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.operator_vehicles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- SAMPLE DATA
-- ============================================

-- Insert sample operators
INSERT INTO public.operators (
    company_name,
    company_email,
    company_phone,
    company_address,
    years_in_business,
    license_number,
    service_areas,
    service_radius_miles,
    is_verified,
    cori_verified,
    insurance_verified,
    total_vehicles,
    vehicle_types,
    rating,
    total_reviews,
    total_trips,
    response_time_avg_mins,
    acceptance_rate,
    base_rate_per_mile,
    minimum_charge,
    is_active,
    is_accepting_requests,
    description,
    specialties,
    certifications
) VALUES 
(
    'SafeRide School Transport',
    'contact@saferideschool.com',
    '+1 (617) 555-0101',
    '123 School St, Boston, MA 02108',
    12,
    'MA-SCH-2024-001',
    ARRAY['MA', 'NH', 'RI'],
    75,
    TRUE,
    TRUE,
    TRUE,
    8,
    ARRAY['school_bus', 'mini_bus'],
    4.8,
    156,
    892,
    15,
    94.5,
    2.50,
    50.00,
    TRUE,
    TRUE,
    'Premier school transportation service with over a decade of experience. All drivers are CORI-certified and trained in child safety protocols.',
    ARRAY['School Routes', 'Field Trips', 'Sports Teams'],
    ARRAY['CORI Certified', 'CPR/First Aid', 'Defensive Driving']
),
(
    'Elite Medical Transport',
    'info@elitemedtransport.com',
    '+1 (617) 555-0202',
    '456 Healthcare Ave, Cambridge, MA 02139',
    8,
    'MA-MED-2024-002',
    ARRAY['MA', 'CT'],
    100,
    TRUE,
    TRUE,
    TRUE,
    5,
    ARRAY['van', 'wheelchair_van'],
    4.9,
    243,
    1456,
    12,
    97.2,
    3.00,
    75.00,
    TRUE,
    TRUE,
    'Specialized non-emergency medical transportation. Wheelchair accessible vehicles with trained medical transport professionals.',
    ARRAY['Wheelchair Transport', 'Hospital Transfers', 'Dialysis Appointments'],
    ARRAY['Medical Transport Certified', 'CPR/First Aid', 'HIPAA Compliant']
),
(
    'Luxury Events Transport',
    'bookings@luxuryevents.com',
    '+1 (617) 555-0303',
    '789 Event Plaza, Brookline, MA 02445',
    15,
    'MA-EVT-2024-003',
    ARRAY['MA', 'NY', 'CT', 'RI'],
    150,
    TRUE,
    TRUE,
    TRUE,
    12,
    ARRAY['coach', 'mini_bus', 'sedan', 'suv'],
    4.7,
    328,
    2104,
    20,
    91.3,
    3.50,
    100.00,
    TRUE,
    TRUE,
    'Upscale transportation for weddings, corporate events, and special occasions. Professional chauffeurs and immaculately maintained vehicles.',
    ARRAY['Weddings', 'Corporate Events', 'Airport Transfers'],
    ARRAY['Professional Chauffeur License', 'DOT Certified', 'Luxury Service Training']
),
(
    'Boston Metro Coach Lines',
    'dispatch@bostonmetro.com',
    '+1 (617) 555-0404',
    '321 Transit Way, Quincy, MA 02169',
    20,
    'MA-COA-2024-004',
    ARRAY['MA', 'NH', 'ME', 'VT', 'CT', 'RI'],
    200,
    TRUE,
    TRUE,
    TRUE,
    25,
    ARRAY['coach', 'school_bus', 'mini_bus'],
    4.6,
    892,
    5234,
    25,
    88.7,
    2.25,
    125.00,
    TRUE,
    TRUE,
    'Largest fleet in New England. From school buses to luxury coaches, we handle groups of any size for any occasion.',
    ARRAY['Large Groups', 'Multi-Day Tours', 'School Districts'],
    ARRAY['DOT Certified', 'ADA Compliant', 'Charter Bus Certified']
),
(
    'Neighborhood School Shuttle',
    'hello@neighborhoodshuttle.com',
    '+1 (617) 555-0505',
    '555 Community Dr, Newton, MA 02458',
    5,
    'MA-SCH-2024-005',
    ARRAY['MA'],
    50,
    TRUE,
    TRUE,
    TRUE,
    4,
    ARRAY['mini_bus', 'van'],
    4.9,
    89,
    456,
    10,
    96.8,
    2.75,
    45.00,
    TRUE,
    TRUE,
    'Family-owned shuttle service specializing in small group transportation. Perfect for private schools and after-school programs.',
    ARRAY['After School Programs', 'Small Groups', 'Flexible Scheduling'],
    ARRAY['CORI Certified', 'First Aid Certified', 'School Transport Specialist']
),
(
    'AccessRide Mobility',
    'service@accessride.com',
    '+1 (617) 555-0606',
    '888 Accessible Blvd, Worcester, MA 01608',
    10,
    'MA-MED-2024-006',
    ARRAY['MA'],
    80,
    TRUE,
    TRUE,
    TRUE,
    7,
    ARRAY['wheelchair_van', 'van'],
    4.8,
    312,
    1823,
    18,
    93.4,
    2.80,
    60.00,
    TRUE,
    TRUE,
    'Dedicated to providing accessible transportation for individuals with mobility challenges. ADA compliant vehicles and trained staff.',
    ARRAY['Wheelchair Accessible', 'Medical Appointments', 'Special Needs'],
    ARRAY['ADA Compliance Certified', 'Mobility Assistance Training', 'CPR/First Aid']
),
(
    'Premier Wedding Coaches',
    'weddings@premiercoaches.com',
    '+1 (617) 555-0707',
    '999 Celebration St, Waltham, MA 02451',
    18,
    'MA-EVT-2024-007',
    ARRAY['MA', 'NH', 'RI', 'CT'],
    120,
    TRUE,
    TRUE,
    TRUE,
    9,
    ARRAY['coach', 'mini_bus', 'suv'],
    4.9,
    441,
    1567,
    22,
    95.1,
    3.25,
    150.00,
    TRUE,
    TRUE,
    'Specializing in wedding transportation with elegant vehicles and professional service. We make your special day unforgettable.',
    ARRAY['Weddings', 'Luxury Events', 'Bachelor/Bachelorette Parties'],
    ARRAY['Professional Chauffeur', 'Event Coordinator Training', 'Luxury Service Expert']
),
(
    'Swift School Solutions',
    'info@swiftschool.com',
    '+1 (617) 555-0808',
    '777 Education Ln, Framingham, MA 01701',
    7,
    'MA-SCH-2024-008',
    ARRAY['MA'],
    60,
    TRUE,
    TRUE,
    TRUE,
    6,
    ARRAY['school_bus', 'mini_bus'],
    4.7,
    178,
    923,
    16,
    92.6,
    2.60,
    55.00,
    TRUE,
    TRUE,
    'Reliable school transportation with real-time GPS tracking. Parents can monitor their child\'s bus in our mobile app.',
    ARRAY['School Routes', 'Activity Buses', 'GPS Tracking'],
    ARRAY['CORI Certified', 'GPS Fleet Management', 'School Safety Certified']
),
(
    'ComfortCare Patient Transport',
    'care@comfortcarept.com',
    '+1 (508) 555-0909',
    '234 Medical Park Dr, Springfield, MA 01103',
    6,
    'MA-MED-2024-009',
    ARRAY['MA', 'CT'],
    90,
    TRUE,
    TRUE,
    TRUE,
    5,
    ARRAY['wheelchair_van', 'van', 'sedan'],
    4.9,
    267,
    1634,
    14,
    95.8,
    2.90,
    70.00,
    TRUE,
    TRUE,
    'Compassionate non-emergency medical transportation with bilingual staff. Specializing in elderly care and dialysis transport.',
    ARRAY['Dialysis Transport', 'Elderly Care', 'Bilingual Service'],
    ARRAY['Medical Transport Certified', 'Elder Care Training', 'Spanish/English Bilingual']
),
(
    'Executive Coach Service',
    'bookings@executivecoach.com',
    '+1 (617) 555-1010',
    '101 Corporate Center, Burlington, MA 01803',
    22,
    'MA-EVT-2024-010',
    ARRAY['MA', 'NY', 'CT', 'NH', 'RI', 'VT'],
    250,
    TRUE,
    TRUE,
    TRUE,
    18,
    ARRAY['coach', 'mini_bus', 'suv', 'sedan'],
    4.8,
    1205,
    6789,
    18,
    92.4,
    3.75,
    175.00,
    TRUE,
    TRUE,
    'Premium corporate and event transportation since 2004. WiFi-enabled fleet, professional drivers, and 24/7 dispatch service.',
    ARRAY['Corporate Events', 'Conferences', 'Airport Service', 'Multi-Day Tours'],
    ARRAY['DOT Certified', 'Executive Driver Training', 'Event Coordination Certified']
),
(
    'Green Valley School Transport',
    'office@greenvalleyschool.com',
    '+1 (413) 555-1111',
    '456 Valley Rd, Pittsfield, MA 01201',
    14,
    'MA-SCH-2024-011',
    ARRAY['MA', 'NY', 'VT'],
    85,
    TRUE,
    TRUE,
    TRUE,
    10,
    ARRAY['school_bus', 'mini_bus'],
    4.6,
    423,
    2456,
    19,
    89.7,
    2.40,
    48.00,
    TRUE,
    TRUE,
    'Serving western Massachusetts school districts for over a decade. Eco-friendly fleet with hybrid and electric buses.',
    ARRAY['School Districts', 'Field Trips', 'Eco-Friendly Fleet'],
    ARRAY['CORI Certified', 'School Safety Certified', 'Eco-Driving Certified']
),
(
    'Celebration Limousine & Coach',
    'events@celebrationlimo.com',
    '+1 (781) 555-1212',
    '789 Celebration Ave, Woburn, MA 01801',
    11,
    'MA-EVT-2024-012',
    ARRAY['MA', 'NH', 'RI'],
    110,
    TRUE,
    TRUE,
    TRUE,
    14,
    ARRAY['suv', 'sedan', 'mini_bus', 'coach'],
    4.8,
    567,
    2134,
    21,
    93.8,
    3.40,
    125.00,
    TRUE,
    TRUE,
    'Elegant transportation for all celebrations. Specializing in proms, quinceañeras, and milestone birthdays.',
    ARRAY['Proms', 'Quinceañeras', 'Bachelor Parties', 'Birthday Celebrations'],
    ARRAY['Professional Chauffeur', 'Event Service Certified', 'Luxury Vehicle Specialist']
),
(
    'Atlantic Shuttle Group',
    'dispatch@atlanticshuttle.com',
    '+1 (617) 555-1313',
    '321 Harbor Blvd, Plymouth, MA 02360',
    9,
    'MA-EVT-2024-013',
    ARRAY['MA', 'RI', 'CT'],
    100,
    TRUE,
    TRUE,
    TRUE,
    11,
    ARRAY['mini_bus', 'van', 'suv'],
    4.7,
    389,
    1876,
    17,
    91.5,
    2.85,
    85.00,
    TRUE,
    TRUE,
    'Flexible shuttle service for hotels, resorts, and cruise terminals. Airport transfers and corporate shuttles our specialty.',
    ARRAY['Hotel Shuttles', 'Airport Transfers', 'Cruise Terminals', 'Corporate Shuttles'],
    ARRAY['Commercial Driver License', 'Airport Ground Transport Certified', 'DOT Certified']
),
(
    'Heritage Tours & Transport',
    'info@heritagetours.com',
    '+1 (508) 555-1414',
    '567 Historic St, Plymouth, MA 02361',
    25,
    'MA-EVT-2024-014',
    ARRAY['MA', 'NH', 'ME', 'VT', 'CT', 'RI', 'NY'],
    300,
    TRUE,
    TRUE,
    TRUE,
    20,
    ARRAY['coach', 'mini_bus'],
    4.9,
    1456,
    8234,
    23,
    94.2,
    2.95,
    150.00,
    TRUE,
    TRUE,
    'New England\'s premier tour operator. Multi-day tours, historical site visits, and custom itineraries with experienced tour guides.',
    ARRAY['Multi-Day Tours', 'Historical Tours', 'Senior Groups', 'Custom Itineraries'],
    ARRAY['Tour Director Certified', 'DOT Certified', 'Historical Tour Guide Licensed']
),
(
    'Reliable Kids Transport',
    'hello@reliablekids.com',
    '+1 (617) 555-1515',
    '890 Family Way, Somerville, MA 02143',
    4,
    'MA-SCH-2024-015',
    ARRAY['MA'],
    40,
    TRUE,
    TRUE,
    TRUE,
    3,
    ARRAY['mini_bus', 'van'],
    4.9,
    124,
    567,
    11,
    97.3,
    3.00,
    40.00,
    TRUE,
    TRUE,
    'Trusted by families for after-school activities, camps, and private school transport. All drivers are parents themselves!',
    ARRAY['After School Programs', 'Camp Transport', 'Activity Shuttles', 'Private Schools'],
    ARRAY['CORI Certified', 'CPR/First Aid', 'Child Safety Specialist']
),
(
    'CareLink Medical Rides',
    'service@carelinktransport.com',
    '+1 (978) 555-1616',
    '123 Healthcare Ln, Lowell, MA 01852',
    13,
    'MA-MED-2024-016',
    ARRAY['MA', 'NH'],
    95,
    TRUE,
    TRUE,
    TRUE,
    8,
    ARRAY['wheelchair_van', 'van', 'sedan'],
    4.8,
    534,
    3012,
    15,
    94.6,
    2.70,
    65.00,
    TRUE,
    TRUE,
    'Partnered with major hospitals and insurance companies. On-time service for medical appointments, treatments, and procedures.',
    ARRAY['Hospital Partnerships', 'Insurance Accepted', 'Recurring Appointments'],
    ARRAY['Medical Transport Certified', 'Insurance Billing Certified', 'HIPAA Compliant']
),
(
    'Prestige Wedding Transportation',
    'weddings@prestigetransport.com',
    '+1 (617) 555-1717',
    '456 Bridal Blvd, Lexington, MA 02420',
    16,
    'MA-EVT-2024-017',
    ARRAY['MA', 'NH', 'RI', 'CT'],
    140,
    TRUE,
    TRUE,
    TRUE,
    10,
    ARRAY['suv', 'sedan', 'mini_bus'],
    5.0,
    623,
    1845,
    19,
    96.7,
    3.60,
    180.00,
    TRUE,
    TRUE,
    'White glove service for your wedding day. Coordinated transportation for bridal party and guests with attention to every detail.',
    ARRAY['Wedding Parties', 'Guest Shuttles', 'Rehearsal Dinners', 'Day-of Coordination'],
    ARRAY['Wedding Coordination Certified', 'Professional Chauffeur', 'Luxury Service Expert']
),
(
    'Campus Connect Shuttle',
    'admin@campusconnect.com',
    '+1 (617) 555-1818',
    '789 University Dr, Cambridge, MA 02138',
    6,
    'MA-SCH-2024-018',
    ARRAY['MA'],
    55,
    TRUE,
    TRUE,
    TRUE,
    7,
    ARRAY['mini_bus', 'van'],
    4.7,
    234,
    1123,
    13,
    93.2,
    2.55,
    50.00,
    TRUE,
    TRUE,
    'University and college transportation specialists. Greek life events, campus tours, and student group activities.',
    ARRAY['University Transport', 'Greek Life', 'Campus Tours', 'Student Groups'],
    ARRAY['University Safety Certified', 'CORI Certified', 'Student Transport Specialist']
),
(
    'Sunset Senior Services',
    'care@sunsetsenior.com',
    '+1 (508) 555-1919',
    '234 Elder St, Worcester, MA 01608',
    17,
    'MA-MED-2024-019',
    ARRAY['MA'],
    70,
    TRUE,
    TRUE,
    TRUE,
    6,
    ARRAY['van', 'sedan'],
    4.9,
    412,
    2234,
    16,
    95.4,
    2.65,
    55.00,
    TRUE,
    TRUE,
    'Senior-focused transportation with door-to-door service. Compassionate drivers trained in senior care and mobility assistance.',
    ARRAY['Senior Centers', 'Medical Appointments', 'Social Outings', 'Shopping Trips'],
    ARRAY['Senior Care Certified', 'Mobility Assistance Training', 'CPR/First Aid']
),
(
    'Metro Charter Express',
    'booking@metrocharterexpress.com',
    '+1 (617) 555-2020',
    '567 Charter Way, Lynn, MA 01901',
    19,
    'MA-EVT-2024-020',
    ARRAY['MA', 'NH', 'ME', 'CT', 'RI', 'VT', 'NY', 'NJ'],
    350,
    TRUE,
    TRUE,
    TRUE,
    28,
    ARRAY['coach', 'mini_bus', 'school_bus'],
    4.6,
    2103,
    11456,
    26,
    87.9,
    2.35,
    140.00,
    TRUE,
    TRUE,
    'One of New England\'s largest charter operations. Casino trips, sporting events, concerts, and custom charters nationwide.',
    ARRAY['Casino Trips', 'Sports Events', 'Concerts', 'Cross-Country Charters'],
    ARRAY['DOT Certified', 'Interstate Commerce Certified', 'National Safety Council Member']
);

-- Insert sample vehicles for SafeRide School Transport
INSERT INTO public.operator_vehicles (
    operator_id,
    vehicle_type,
    make,
    model,
    year,
    color,
    license_plate,
    passenger_capacity,
    wheelchair_capacity,
    has_wifi,
    has_ac,
    wheelchair_accessible,
    has_car_seats,
    is_active
) 
SELECT 
    id,
    'school_bus',
    'Blue Bird',
    'Vision',
    2022,
    'Yellow',
    'MA-SCH-101',
    54,
    2,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'SafeRide School Transport';

-- Insert sample vehicles for Elite Medical Transport
INSERT INTO public.operator_vehicles (
    operator_id,
    vehicle_type,
    make,
    model,
    year,
    color,
    license_plate,
    passenger_capacity,
    wheelchair_capacity,
    has_wifi,
    has_ac,
    wheelchair_accessible,
    is_active
) 
SELECT 
    id,
    'wheelchair_van',
    'Ford',
    'Transit 350',
    2023,
    'White',
    'MA-MED-201',
    8,
    2,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'Elite Medical Transport';

-- Insert sample vehicles for Luxury Events Transport
INSERT INTO public.operator_vehicles (
    operator_id,
    vehicle_type,
    make,
    model,
    year,
    color,
    license_plate,
    passenger_capacity,
    has_wifi,
    has_ac,
    has_tv,
    has_restroom,
    is_active
) 
SELECT 
    id,
    'coach',
    'Prevost',
    'H3-45',
    2021,
    'Black',
    'MA-EVT-301',
    56,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'Luxury Events Transport';

-- Insert sample vehicles for Boston Metro Coach Lines
INSERT INTO public.operator_vehicles (
    operator_id,
    vehicle_type,
    make,
    model,
    year,
    color,
    license_plate,
    passenger_capacity,
    has_wifi,
    has_ac,
    has_tv,
    has_restroom,
    is_active
) 
SELECT 
    id,
    'coach',
    'MCI',
    'J4500',
    2020,
    'Silver',
    'MA-COA-401',
    55,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'Boston Metro Coach Lines';

-- More vehicles for SafeRide School Transport
INSERT INTO public.operator_vehicles (
    operator_id,
    vehicle_type,
    make,
    model,
    year,
    color,
    license_plate,
    passenger_capacity,
    wheelchair_capacity,
    has_wifi,
    has_ac,
    has_car_seats,
    is_active
) 
SELECT 
    id,
    'mini_bus',
    'Ford',
    'E-450',
    2023,
    'Yellow',
    'MA-SCH-102',
    28,
    1,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'SafeRide School Transport'
UNION ALL
SELECT 
    id,
    'school_bus',
    'Thomas Built',
    'Saf-T-Liner C2',
    2021,
    'Yellow',
    'MA-SCH-103',
    48,
    2,
    FALSE,
    TRUE,
    FALSE,
    TRUE
FROM public.operators WHERE company_name = 'SafeRide School Transport';

-- More vehicles for Elite Medical Transport
INSERT INTO public.operator_vehicles (
    operator_id,
    vehicle_type,
    make,
    model,
    year,
    color,
    license_plate,
    passenger_capacity,
    wheelchair_capacity,
    has_wifi,
    has_ac,
    wheelchair_accessible,
    is_active
) 
SELECT 
    id,
    'van',
    'Mercedes-Benz',
    'Sprinter',
    2023,
    'White',
    'MA-MED-202',
    12,
    0,
    TRUE,
    TRUE,
    FALSE,
    TRUE
FROM public.operators WHERE company_name = 'Elite Medical Transport'
UNION ALL
SELECT 
    id,
    'wheelchair_van',
    'Ram',
    'ProMaster 2500',
    2022,
    'White',
    'MA-MED-203',
    6,
    3,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'Elite Medical Transport';

-- Vehicles for Luxury Events Transport
INSERT INTO public.operator_vehicles (
    operator_id,
    vehicle_type,
    make,
    model,
    year,
    color,
    license_plate,
    passenger_capacity,
    has_wifi,
    has_ac,
    has_tv,
    is_active
) 
SELECT 
    id,
    'mini_bus',
    'Mercedes-Benz',
    'Sprinter Executive',
    2023,
    'Black',
    'MA-EVT-302',
    14,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'Luxury Events Transport'
UNION ALL
SELECT 
    id,
    'suv',
    'Cadillac',
    'Escalade ESV',
    2024,
    'Black',
    'MA-EVT-303',
    7,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'Luxury Events Transport'
UNION ALL
SELECT 
    id,
    'sedan',
    'Mercedes-Benz',
    'S-Class',
    2024,
    'Black',
    'MA-EVT-304',
    4,
    TRUE,
    TRUE,
    FALSE,
    TRUE
FROM public.operators WHERE company_name = 'Luxury Events Transport';

-- Vehicles for ComfortCare Patient Transport
INSERT INTO public.operator_vehicles (
    operator_id,
    vehicle_type,
    make,
    model,
    year,
    color,
    license_plate,
    passenger_capacity,
    wheelchair_capacity,
    has_wifi,
    has_ac,
    wheelchair_accessible,
    is_active
) 
SELECT 
    id,
    'wheelchair_van',
    'Dodge',
    'Grand Caravan',
    2022,
    'Blue',
    'MA-MED-901',
    5,
    1,
    FALSE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'ComfortCare Patient Transport'
UNION ALL
SELECT 
    id,
    'van',
    'Toyota',
    'Sienna',
    2023,
    'White',
    'MA-MED-902',
    7,
    0,
    TRUE,
    TRUE,
    FALSE,
    TRUE
FROM public.operators WHERE company_name = 'ComfortCare Patient Transport';

-- Vehicles for Executive Coach Service
INSERT INTO public.operator_vehicles (
    operator_id,
    vehicle_type,
    make,
    model,
    year,
    color,
    license_plate,
    passenger_capacity,
    has_wifi,
    has_ac,
    has_tv,
    has_restroom,
    is_active
) 
SELECT 
    id,
    'coach',
    'Van Hool',
    'CX45',
    2022,
    'White',
    'MA-EVT-1001',
    57,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'Executive Coach Service'
UNION ALL
SELECT 
    id,
    'coach',
    'Prevost',
    'X3-45',
    2021,
    'Black',
    'MA-EVT-1002',
    56,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'Executive Coach Service'
UNION ALL
SELECT 
    id,
    'mini_bus',
    'Mercedes-Benz',
    'Sprinter',
    2024,
    'Silver',
    'MA-EVT-1003',
    16,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    TRUE
FROM public.operators WHERE company_name = 'Executive Coach Service';

-- Vehicles for Prestige Wedding Transportation
INSERT INTO public.operator_vehicles (
    operator_id,
    vehicle_type,
    make,
    model,
    year,
    color,
    license_plate,
    passenger_capacity,
    has_wifi,
    has_ac,
    is_active
) 
SELECT 
    id,
    'suv',
    'Lincoln',
    'Navigator L',
    2024,
    'White',
    'MA-EVT-1701',
    8,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'Prestige Wedding Transportation'
UNION ALL
SELECT 
    id,
    'sedan',
    'BMW',
    '7 Series',
    2024,
    'White',
    'MA-EVT-1702',
    4,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'Prestige Wedding Transportation'
UNION ALL
SELECT 
    id,
    'mini_bus',
    'Ford',
    'Transit Party Bus',
    2023,
    'White',
    'MA-EVT-1703',
    20,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'Prestige Wedding Transportation';

-- Vehicles for Metro Charter Express
INSERT INTO public.operator_vehicles (
    operator_id,
    vehicle_type,
    make,
    model,
    year,
    color,
    license_plate,
    passenger_capacity,
    has_wifi,
    has_ac,
    has_tv,
    has_restroom,
    is_active
) 
SELECT 
    id,
    'coach',
    'MCI',
    'D4505',
    2019,
    'Blue',
    'MA-EVT-2001',
    56,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'Metro Charter Express'
UNION ALL
SELECT 
    id,
    'coach',
    'Prevost',
    'H3-45',
    2020,
    'White',
    'MA-EVT-2002',
    55,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'Metro Charter Express'
UNION ALL
SELECT 
    id,
    'coach',
    'Van Hool',
    'CX45',
    2021,
    'Silver',
    'MA-EVT-2003',
    57,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'Metro Charter Express';

-- Vehicles for Heritage Tours & Transport
INSERT INTO public.operator_vehicles (
    operator_id,
    vehicle_type,
    make,
    model,
    year,
    color,
    license_plate,
    passenger_capacity,
    has_wifi,
    has_ac,
    has_tv,
    has_restroom,
    is_active
) 
SELECT 
    id,
    'coach',
    'Prevost',
    'H3-45 VIP',
    2023,
    'Burgundy',
    'MA-EVT-1401',
    50,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'Heritage Tours & Transport'
UNION ALL
SELECT 
    id,
    'mini_bus',
    'Ford',
    'F-550',
    2022,
    'Burgundy',
    'MA-EVT-1402',
    24,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    TRUE
FROM public.operators WHERE company_name = 'Heritage Tours & Transport';

-- Vehicles for AccessRide Mobility
INSERT INTO public.operator_vehicles (
    operator_id,
    vehicle_type,
    make,
    model,
    year,
    color,
    license_plate,
    passenger_capacity,
    wheelchair_capacity,
    has_wifi,
    has_ac,
    wheelchair_accessible,
    is_active
) 
SELECT 
    id,
    'wheelchair_van',
    'Ford',
    'Transit 350 HD',
    2023,
    'Blue',
    'MA-MED-601',
    10,
    3,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'AccessRide Mobility'
UNION ALL
SELECT 
    id,
    'wheelchair_van',
    'Ram',
    'ProMaster 3500',
    2022,
    'Blue',
    'MA-MED-602',
    8,
    4,
    TRUE,
    TRUE,
    TRUE,
    TRUE
FROM public.operators WHERE company_name = 'AccessRide Mobility';

-- Update total_vehicles count for operators based on actual vehicles
UPDATE public.operators o
SET total_vehicles = (
    SELECT COUNT(*) FROM public.operator_vehicles v WHERE v.operator_id = o.id
);
