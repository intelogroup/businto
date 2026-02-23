-- ============================================
-- ADD LOCATION AND CAPACITY TRACKING
-- ============================================

-- Add geographic coordinates for distance-based matching
ALTER TABLE public.operators 
ADD COLUMN IF NOT EXISTS company_lat DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS company_lng DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

-- Add capacity tracking
ALTER TABLE public.operators 
ADD COLUMN IF NOT EXISTS active_quotes_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_trips_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_quote_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_booking_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS max_concurrent_quotes INTEGER DEFAULT 15;

-- Create indexes for efficient distance queries
CREATE INDEX IF NOT EXISTS idx_operators_lat_lng ON public.operators(company_lat, company_lng) WHERE company_lat IS NOT NULL AND company_lng IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operators_quotes_count ON public.operators(active_quotes_count);
CREATE INDEX IF NOT EXISTS idx_operators_accepting ON public.operators(is_accepting_requests, is_active, is_verified) WHERE is_accepting_requests = TRUE;

-- Create composite index for common matching queries
CREATE INDEX IF NOT EXISTS idx_operators_matching ON public.operators(is_verified, is_active, is_accepting_requests, rating DESC) WHERE is_verified = TRUE AND is_active = TRUE;

-- ============================================
-- GEOCODE EXISTING OPERATORS
-- ============================================

-- Sample geocoding for Boston-area operators
-- In production, you'd call an API to geocode all addresses

UPDATE public.operators SET 
    company_lat = 42.3601,
    company_lng = -71.0589,
    geocoded_at = NOW()
WHERE company_name = 'SafeRide School Transport';

UPDATE public.operators SET 
    company_lat = 42.3736,
    company_lng = -71.1097,
    geocoded_at = NOW()
WHERE company_name = 'Elite Medical Transport';

UPDATE public.operators SET 
    company_lat = 42.3318,
    company_lng = -71.1211,
    geocoded_at = NOW()
WHERE company_name = 'Luxury Events Transport';

UPDATE public.operators SET 
    company_lat = 42.2529,
    company_lng = -71.0023,
    geocoded_at = NOW()
WHERE company_name = 'Boston Metro Coach Lines';

UPDATE public.operators SET 
    company_lat = 42.3370,
    company_lng = -71.1893,
    geocoded_at = NOW()
WHERE company_name = 'Neighborhood School Shuttle';

UPDATE public.operators SET 
    company_lat = 42.2626,
    company_lng = -71.8023,
    geocoded_at = NOW()
WHERE company_name = 'AccessRide Mobility';

UPDATE public.operators SET 
    company_lat = 42.3765,
    company_lng = -71.2356,
    geocoded_at = NOW()
WHERE company_name = 'Premier Wedding Coaches';

UPDATE public.operators SET 
    company_lat = 42.2791,
    company_lng = -71.4162,
    geocoded_at = NOW()
WHERE company_name = 'Swift School Solutions';

UPDATE public.operators SET 
    company_lat = 42.3478,
    company_lng = -71.0466,
    geocoded_at = NOW()
WHERE company_name = 'ComfortCare Patient Transport';

UPDATE public.operators SET 
    company_lat = 42.4072,
    company_lng = -71.1144,
    geocoded_at = NOW()
WHERE company_name = 'Green Fleet Transport';

UPDATE public.operators SET 
    company_lat = 42.3223,
    company_lng = -71.0847,
    geocoded_at = NOW()
WHERE company_name = 'Capital Coaches';

UPDATE public.operators SET 
    company_lat = 42.4399,
    company_lng = -71.1469,
    geocoded_at = NOW()
WHERE company_name = 'Reliable School Services';

UPDATE public.operators SET 
    company_lat = 41.8240,
    company_lng = -71.4128,
    geocoded_at = NOW()
WHERE company_name = 'Providence Charter Co';

UPDATE public.operators SET 
    company_lat = 43.0718,
    company_lng = -70.7626,
    geocoded_at = NOW()
WHERE company_name = 'Seacoast Transit Group';

UPDATE public.operators SET 
    company_lat = 42.0954,
    company_lng = -71.0188,
    geocoded_at = NOW()
WHERE company_name = 'South Shore Charters';

UPDATE public.operators SET 
    company_lat = 42.4678,
    company_lng = -71.1448,
    geocoded_at = NOW()
WHERE company_name = 'North Metro Transport';

UPDATE public.operators SET 
    company_lat = 42.1015,
    company_lng = -72.5898,
    geocoded_at = NOW()
WHERE company_name = 'Pioneer Valley Lines';

UPDATE public.operators SET 
    company_lat = 42.1751,
    company_lng = -72.6760,
    geocoded_at = NOW()
WHERE company_name = 'Valley School Express';

UPDATE public.operators SET 
    company_lat = 42.2843,
    company_lng = -71.3488,
    geocoded_at = NOW()
WHERE company_name = 'MetroWest Mobility';

UPDATE public.operators SET 
    company_lat = 42.4184,
    company_lng = -71.1062,
    geocoded_at = NOW()
WHERE company_name = 'Prestige Events Transport';

-- ============================================
-- FUNCTION: Calculate distance between two points
-- ============================================

CREATE OR REPLACE FUNCTION calculate_distance(
    lat1 DECIMAL,
    lng1 DECIMAL,
    lat2 DECIMAL,
    lng2 DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
    earth_radius DECIMAL := 3959; -- miles (use 6371 for km)
    d_lat DECIMAL;
    d_lng DECIMAL;
    a DECIMAL;
    c DECIMAL;
BEGIN
    -- Convert degrees to radians
    d_lat := radians(lat2 - lat1);
    d_lng := radians(lng2 - lng1);
    
    -- Haversine formula
    a := sin(d_lat / 2) * sin(d_lat / 2) +
         cos(radians(lat1)) * cos(radians(lat2)) *
         sin(d_lng / 2) * sin(d_lng / 2);
    
    c := 2 * atan2(sqrt(a), sqrt(1 - a));
    
    RETURN earth_radius * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- FUNCTION: Find operators within radius
-- ============================================

CREATE OR REPLACE FUNCTION find_operators_within_radius(
    pickup_lat DECIMAL,
    pickup_lng DECIMAL,
    max_results INTEGER DEFAULT 10
) RETURNS TABLE (
    operator_id UUID,
    company_name TEXT,
    distance_miles DECIMAL,
    rating DECIMAL,
    service_radius_miles INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.company_name,
        calculate_distance(pickup_lat, pickup_lng, o.company_lat, o.company_lng) as distance,
        o.rating,
        o.service_radius_miles
    FROM public.operators o
    WHERE 
        o.company_lat IS NOT NULL 
        AND o.company_lng IS NOT NULL
        AND o.is_verified = TRUE
        AND o.is_active = TRUE
        AND o.is_accepting_requests = TRUE
        AND calculate_distance(pickup_lat, pickup_lng, o.company_lat, o.company_lng) <= o.service_radius_miles
    ORDER BY distance ASC, o.rating DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER: Update active quotes count
-- ============================================

CREATE OR REPLACE FUNCTION update_operator_quote_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Update count when quote is inserted or status changes
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        UPDATE public.operators 
        SET 
            active_quotes_count = (
                SELECT COUNT(*) 
                FROM public.quotes 
                WHERE operator_id = NEW.operator_id 
                AND status IN ('pending', 'sent')
            ),
            last_quote_at = CASE 
                WHEN NEW.status IN ('pending', 'sent') THEN NOW()
                ELSE last_quote_at
            END
        WHERE id = NEW.operator_id;
    END IF;
    
    -- Update count when quote is deleted
    IF (TG_OP = 'DELETE') THEN
        UPDATE public.operators 
        SET active_quotes_count = (
            SELECT COUNT(*) 
            FROM public.quotes 
            WHERE operator_id = OLD.operator_id 
            AND status IN ('pending', 'sent')
        )
        WHERE id = OLD.operator_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS maintain_operator_quote_count ON public.quotes;

-- Create trigger on quotes table
CREATE TRIGGER maintain_operator_quote_count
AFTER INSERT OR UPDATE OR DELETE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION update_operator_quote_count();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN public.operators.company_lat IS 'Latitude of operator headquarters for distance calculations';
COMMENT ON COLUMN public.operators.company_lng IS 'Longitude of operator headquarters for distance calculations';
COMMENT ON COLUMN public.operators.geocoded_at IS 'When the address was geocoded';
COMMENT ON COLUMN public.operators.active_quotes_count IS 'Number of active/pending quotes this operator has';
COMMENT ON COLUMN public.operators.max_concurrent_quotes IS 'Maximum number of quotes operator can handle simultaneously';
COMMENT ON FUNCTION calculate_distance IS 'Calculate distance in miles between two lat/lng points using Haversine formula';
COMMENT ON FUNCTION find_operators_within_radius IS 'Find operators within their service radius of a pickup location';
