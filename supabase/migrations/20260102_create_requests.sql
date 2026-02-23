-- Migration: Create requests table with fuzzy location support
-- This table stores transportation requests while maintaining user privacy.

CREATE TABLE IF NOT EXISTS public.transport_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Service Information
    service_type TEXT NOT NULL, -- 'school', 'medical', 'wedding'
    
    -- Location Information (Fuzzy for Operators)
    pickup_fuzzy_location TEXT NOT NULL, -- e.g. "Main St, Everett"
    dropoff_fuzzy_location TEXT NOT NULL, -- e.g. "Bishop Fenwick High"
    
    -- Precise Information (Encrypted or hidden from public views)
    pickup_exact_address TEXT NOT NULL,
    dropoff_exact_address TEXT NOT NULL,
    pickup_coords POINT, -- (Lat, Long) for routing math
    
    -- Calculated Logistics
    trip_distance_miles DECIMAL(10, 2),
    estimated_duration_mins INTEGER,
    
    -- Trip Details
    scheduled_date DATE NOT NULL,
    scheduled_time TIME,
    
    -- Metadata/Status
    status TEXT DEFAULT 'pending' NOT NULL, -- 'pending', 'quoted', 'booked', 'completed'
    metadata JSONB DEFAULT '{}'::jsonb -- Additional form-specific fields
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_transport_requests_status ON public.transport_requests(status);
CREATE INDEX IF NOT EXISTS idx_transport_requests_service_type ON public.transport_requests(service_type);

-- Comments for clarity
COMMENT ON COLUMN public.transport_requests.pickup_fuzzy_location IS 'The masked address shared with operators for initial quoting.';
COMMENT ON COLUMN public.transport_requests.pickup_exact_address IS 'The full address, visible only after a booking is confirmed.';
