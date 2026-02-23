-- Event logs for request/quote/booking lifecycle observability
-- Used by API routes to record rich operational/audit events.

CREATE TABLE IF NOT EXISTS public.event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',

  actor_type TEXT,
  actor_id TEXT,

  user_id UUID,
  operator_id TEXT,
  request_id UUID REFERENCES public.transport_requests(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,

  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_event_logs_created_at ON public.event_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_logs_request_id ON public.event_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_quote_id ON public.event_logs(quote_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_booking_id ON public.event_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_event_type ON public.event_logs(event_type);

COMMENT ON TABLE public.event_logs IS 'Operational and business event timeline (requests, quotes, bookings, notifications).';
COMMENT ON COLUMN public.event_logs.event_type IS 'Machine-friendly event name, e.g. request.created, quote.submitted, quote.accepted.';
COMMENT ON COLUMN public.event_logs.status IS 'success or error';
COMMENT ON COLUMN public.event_logs.metadata IS 'Additional structured context for debugging and analytics.';
