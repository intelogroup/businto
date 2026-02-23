-- Complete MVP Schema for Businto
-- Run this after enabling auth in Supabase dashboard

-- ============================================
-- PROFILES (extends Supabase Auth)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    email TEXT NOT NULL,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user' NOT NULL CHECK (role IN ('user', 'operator', 'admin')),
    -- Operator-specific fields
    company_name TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    cori_verified BOOLEAN DEFAULT FALSE,
    insurance_verified BOOLEAN DEFAULT FALSE
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- TRANSPORT REQUESTS (updated)
-- ============================================
DROP TABLE IF EXISTS public.transport_requests CASCADE;
CREATE TABLE public.transport_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Service type
    service_type TEXT NOT NULL CHECK (service_type IN ('school', 'medical', 'wedding')),

    -- Fuzzy locations (shown to operators)
    pickup_fuzzy TEXT NOT NULL,
    dropoff_fuzzy TEXT NOT NULL,

    -- Exact locations (hidden until booking confirmed)
    pickup_address TEXT NOT NULL,
    dropoff_address TEXT NOT NULL,
    pickup_lat DECIMAL(10, 8),
    pickup_lng DECIMAL(11, 8),
    dropoff_lat DECIMAL(10, 8),
    dropoff_lng DECIMAL(11, 8),

    -- Trip details
    distance_miles DECIMAL(10, 2),
    duration_mins INTEGER,

    -- Schedule
    start_date DATE NOT NULL,
    start_time TIME,
    end_date DATE,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_pattern TEXT, -- 'daily', 'weekly', 'custom'

    -- Service-specific metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Status
    status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'quoted', 'booked', 'in_progress', 'completed', 'cancelled')),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '2 hours')
);

CREATE INDEX idx_requests_user ON public.transport_requests(user_id);
CREATE INDEX idx_requests_status ON public.transport_requests(status);
CREATE INDEX idx_requests_created ON public.transport_requests(created_at DESC);

-- ============================================
-- QUOTES (operators submit quotes for requests)
-- ============================================
CREATE TABLE IF NOT EXISTS public.quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    request_id UUID NOT NULL REFERENCES public.transport_requests(id) ON DELETE CASCADE,
    operator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Pricing
    total_price DECIMAL(10, 2) NOT NULL,
    base_fare DECIMAL(10, 2),
    distance_charge DECIMAL(10, 2),
    additional_fees JSONB DEFAULT '[]'::jsonb,

    -- Vehicle info
    vehicle_type TEXT NOT NULL,
    vehicle_year INTEGER,
    vehicle_capacity INTEGER,
    vehicle_photo_url TEXT,

    -- Features
    wheelchair_accessible BOOLEAN DEFAULT FALSE,

    -- Operator note
    note TEXT,
    response_time_mins INTEGER,

    -- Status
    status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '2 hours'),

    UNIQUE(request_id, operator_id)
);

CREATE INDEX idx_quotes_request ON public.quotes(request_id);
CREATE INDEX idx_quotes_operator ON public.quotes(operator_id);
CREATE INDEX idx_quotes_status ON public.quotes(status);

-- ============================================
-- BOOKINGS (when a quote is accepted)
-- ============================================
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    request_id UUID NOT NULL REFERENCES public.transport_requests(id),
    quote_id UUID NOT NULL REFERENCES public.quotes(id),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    operator_id UUID NOT NULL REFERENCES public.profiles(id),

    -- Payment
    amount DECIMAL(10, 2) NOT NULL,
    stripe_payment_intent_id TEXT,
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed')),

    -- Status
    status TEXT DEFAULT 'confirmed' NOT NULL CHECK (status IN ('confirmed', 'in_progress', 'completed', 'cancelled')),

    -- Confirmation details
    confirmation_code TEXT UNIQUE DEFAULT UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 8)),
    special_instructions TEXT
);

CREATE INDEX idx_bookings_user ON public.bookings(user_id);
CREATE INDEX idx_bookings_operator ON public.bookings(operator_id);
CREATE INDEX idx_bookings_status ON public.bookings(status);

-- ============================================
-- MESSAGES (chat between users and operators)
-- ============================================
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Can be linked to request or booking
    request_id UUID REFERENCES public.transport_requests(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,

    sender_id UUID NOT NULL REFERENCES public.profiles(id),
    recipient_id UUID NOT NULL REFERENCES public.profiles(id),

    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,

    CHECK (request_id IS NOT NULL OR booking_id IS NOT NULL)
);

CREATE INDEX idx_messages_request ON public.messages(request_id);
CREATE INDEX idx_messages_booking ON public.messages(booking_id);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_recipient ON public.messages(recipient_id);

-- ============================================
-- REVIEWS (after trip completion)
-- ============================================
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    operator_id UUID NOT NULL REFERENCES public.profiles(id),

    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,

    -- Operator can respond
    operator_response TEXT,
    operator_response_at TIMESTAMPTZ
);

CREATE INDEX idx_reviews_operator ON public.reviews(operator_id);
CREATE INDEX idx_reviews_user ON public.reviews(user_id);

-- ============================================
-- NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    type TEXT NOT NULL, -- 'quote_received', 'booking_confirmed', 'message', 'reminder'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,

    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id) WHERE is_read = FALSE;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, update own
CREATE POLICY "Public profiles are viewable" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Requests: users see own, operators see all pending
CREATE POLICY "Users see own requests" ON public.transport_requests FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Operators see pending requests" ON public.transport_requests FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'operator'));
CREATE POLICY "Anyone can create requests" ON public.transport_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own requests" ON public.transport_requests FOR UPDATE USING (auth.uid() = user_id);

-- Quotes: users see quotes for their requests, operators see own quotes
CREATE POLICY "Users see quotes for their requests" ON public.quotes FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.transport_requests WHERE id = request_id AND user_id = auth.uid()));
CREATE POLICY "Operators see own quotes" ON public.quotes FOR SELECT USING (auth.uid() = operator_id);
CREATE POLICY "Operators can create quotes" ON public.quotes FOR INSERT WITH CHECK (auth.uid() = operator_id);
CREATE POLICY "Operators can update own quotes" ON public.quotes FOR UPDATE USING (auth.uid() = operator_id);

-- Bookings: involved parties can see
CREATE POLICY "Users see own bookings" ON public.bookings FOR SELECT USING (auth.uid() = user_id OR auth.uid() = operator_id);
CREATE POLICY "System can create bookings" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Messages: participants can see
CREATE POLICY "Users see own messages" ON public.messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "Users can send messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Reviews: public read, users create own
CREATE POLICY "Reviews are public" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Users can create reviews" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Notifications: own only
CREATE POLICY "Users see own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Get operator stats
CREATE OR REPLACE FUNCTION public.get_operator_stats(operator_uuid UUID)
RETURNS TABLE (
    total_reviews BIGINT,
    average_rating DECIMAL,
    total_trips BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(r.id) as total_reviews,
        COALESCE(AVG(r.rating)::DECIMAL(3,2), 0) as average_rating,
        COUNT(DISTINCT b.id) as total_trips
    FROM public.profiles p
    LEFT JOIN public.bookings b ON b.operator_id = p.id AND b.status = 'completed'
    LEFT JOIN public.reviews r ON r.operator_id = p.id
    WHERE p.id = operator_uuid
    GROUP BY p.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_requests_updated_at BEFORE UPDATE ON public.transport_requests
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
