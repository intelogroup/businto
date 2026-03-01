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

import { createClient as createServerAuthClient } from '@/lib/supabase/server';

/**
 * Ensures the request is from an authenticated user.
 */
export async function requireUser() {
  const supabase = await createServerAuthClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * Ensures the request is from an authenticated user with the 'admin' role.
 */
export async function requireAdmin() {
  const user = await requireUser();
  if (!user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return profile?.role === 'admin' ? user : null;
}
