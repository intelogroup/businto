-- Phase 2 — BUS-WEBHOOK-DEDUPE-SWALLOW-001 (M3 claim discipline):
-- guarantee the webhook dedupe claim is atomic at the database level.
--
-- The founding migration (20260117235959_add_webhook_events.sql)
-- declares stripe_event_id TEXT UNIQUE, but it creates the table with
-- CREATE TABLE IF NOT EXISTS: a webhook_events table that pre-dates
-- that migration carries no unique constraint, and the webhook
-- route's dedupe insert then has no atomic claim to lean on (its
-- conflict path — "already recorded" — can never fire). This
-- migration adds the guarantee as a unique index when absent; on a
-- table created by the founding migration it is redundant but
-- harmless.
--
-- STATUS: authored 2026-11-10 on the Phase 2 branch — **UNAPPLIED**.
-- Applying migrations is part of landing and happens only on Jim's
-- word.
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_stripe_event_id_unique
  ON webhook_events (stripe_event_id);
