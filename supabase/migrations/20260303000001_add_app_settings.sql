-- Simple key-value store for runtime app configuration (e.g. manual dispatch mode)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'null',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default: manual dispatch mode is OFF (auto-matching is on)
INSERT INTO public.app_settings (key, value)
VALUES ('manual_dispatch_mode', 'false')
ON CONFLICT (key) DO NOTHING;

-- Only service_role (used by server-side API routes) can access this table
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
