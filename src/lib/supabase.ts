import { createBrowserClient } from '@supabase/ssr';

// Backward-compatible singleton for client-side use
// For server code (Route Handlers, Server Actions) use `src/lib/supabase/server.ts` instead
export const supabase = createBrowserClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321').trim(),
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'anon-key').trim()
);
