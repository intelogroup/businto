-- Add end_time column to transport requests for improved scheduling data
ALTER TABLE public.transport_requests
    ADD COLUMN IF NOT EXISTS end_time TIME;

COMMENT ON COLUMN public.transport_requests.end_time IS 'Optional end time for the request, useful for return trips and reporting.';
