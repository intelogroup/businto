import { createClient } from '@supabase/supabase-js';

// Service role client for internal API routes (bypasses RLS)
// Never expose this to the browser or client-side code
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// For server-side code that needs a user-session-aware client,
// use `createClient` from `@/lib/supabase/server` instead.
// This legacy export is kept for backward compatibility.
export { createClient as createServerClient } from '@/lib/supabase/server';
