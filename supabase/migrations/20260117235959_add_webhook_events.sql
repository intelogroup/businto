-- Create webhook_events table for idempotency
-- Prevents duplicate processing of Stripe webhook events
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by stripe_event_id
CREATE INDEX idx_webhook_events_stripe_event_id ON webhook_events(stripe_event_id);

-- Index for cleanup queries (delete old events after 30 days)
CREATE INDEX idx_webhook_events_processed_at ON webhook_events(processed_at);

-- Comment explaining purpose
COMMENT ON TABLE webhook_events IS 'Tracks processed Stripe webhook events for idempotency. Prevents duplicate event processing.';
