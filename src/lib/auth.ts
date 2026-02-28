import type { Session, User as SupabaseAuthUser } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "operator" | "user";
  avatar?: string;
  operatorId?: string; // Link to the operator company if applicable
}

export function normalizeRole(rawRole: unknown): AuthUser["role"] {
  if (rawRole === "admin" || rawRole === "manager" || rawRole === "operator") {
    return rawRole;
  }
  return "user";
}

function getFrontendOrigin() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) {
    // Remove trailing slash if present
    return envUrl.replace(/\/$/, "");
  }
  return "https://businto.vercel.app";
}

export async function mapSupabaseUser(
  authUser: SupabaseAuthUser,
  supabaseClient = createClient()
): Promise<AuthUser> {
  let profileName: string | undefined;
  let profileRole: AuthUser["role"] = "user";
  let profileAvatar: string | undefined;
  let operatorId: string | undefined;

  try {
    // Use the unified_profiles view for efficient lookup across all profile types
    const { data: profile, error } = await supabaseClient
      .from("unified_profiles")
      .select("full_name, role, avatar_url, operator_id")
      .eq("id", authUser.id)
      .maybeSingle();

    if (error) {
      console.error("[Auth] Error fetching from unified_profiles:", error);
    }

    if (profile) {
      console.log("[Auth] Profile found in unified_profiles:", profile);
      profileName = profile.full_name || undefined;
      profileRole = normalizeRole(profile.role);
      profileAvatar = profile.avatar_url || undefined;
      operatorId = (profile as any).operator_id || undefined;
    } else {
      console.log("[Auth] No profile found in unified_profiles for user ID:", authUser.id);
    }
  } catch (err) {
    console.error("[Auth] Critical error in mapSupabaseUser query:", err);
  }

  const derivedName =
    profileName ||
    authUser.user_metadata?.full_name ||
    authUser.email?.split("@")[0] ||
    "User";

  return {
    id: authUser.id,
    name: derivedName,
    email: authUser.email || "",
    role: profileRole,
    avatar:
      profileAvatar ||
      authUser.user_metadata?.avatar_url ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${authUser.email || authUser.id}`,
    operatorId,
  };
}

export async function signInWithPassword(
  email: string,
  password: string,
  supabaseClient = createClient()
) {
  console.log("[Auth] signInWithPassword started for:", email);
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("[Auth] signInWithPassword Supabase error:", error);
    throw error;
  }

  console.log("[Auth] signInWithPassword success, user ID:", data.user?.id);
  return data;
}

export async function sendMagicLink(
  email: string,
  redirectTo?: string,
  supabaseClient = createClient()
) {
  // Use the callback route to handle the code exchange
  const callbackUrl = `${getFrontendOrigin()}/api/auth/callback`;
  const finalRedirect = redirectTo 
    ? `${callbackUrl}?next=${encodeURIComponent(redirectTo)}`
    : callbackUrl;

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: finalRedirect,
    },
  });

  if (error) {
    throw error;
  }
}

export async function registerUser(
  email: string,
  password: string,
  fullName: string,
  supabaseClient = createClient()
) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
      emailRedirectTo: `${getFrontendOrigin()}/api/auth/callback`,
    },
  });

  if (error) {
    throw error;
  }

  if (data.user) {
    await supabaseClient.from("profiles").upsert({
      id: data.user.id,
      full_name: fullName,
      role: "user",
    });
  }

  return data;
}

/**
 * Sends a password reset email. The link redirects to /api/auth/confirm
 * which calls verifyOtp server-side (sets a session cookie), then redirects
 * the user to /login/reset-password.
 *
 * IMPORTANT — two things required in Supabase Dashboard:
 *
 * 1. Auth → URL Configuration → Redirect URLs — add:
 *      https://businto.vercel.app/api/auth/callback
 *      http://localhost:3000/api/auth/callback
 *    (the default email template already sends ?code= to this route)
 *
 * 2. Auth → URL Configuration → Redirect URLs — add:
 *      https://businto.vercel.app/api/auth/callback
 *      http://localhost:3000/api/auth/callback
 */
export async function resetPasswordForEmail(
  email: string,
  supabaseClient = createClient()
) {
  const redirectTo = `${getFrontendOrigin()}/api/auth/callback?next=/login/reset-password`;
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) {
    throw error;
  }
}

/**
 * Updates the authenticated user's password. Must be called after the user
 * has clicked the reset link and has an active session (via auth callback).
 */
export async function updatePassword(
  newPassword: string,
  supabaseClient = createClient()
) {
  console.log("[Auth] updatePassword started...");
  const { data: { session } } = await supabaseClient.auth.getSession();
  console.log("[Auth] Current session state:", {
    hasSession: !!session,
    userEmail: session?.user?.email,
    userId: session?.user?.id
  });

  const { data, error } = await supabaseClient.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    console.error("[Auth] updatePassword error:", error);
    throw error;
  }

  console.log("[Auth] updatePassword success");
  return data;
}

export async function signOutUser(supabaseClient = createClient()) {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      const message = (error as any).message ?? '';
      if (message.includes('Auth session missing')) {
        console.warn('[Auth] Sign-out skipped because no session was present.');
        return;
      }
      throw error;
    }
  } catch (err) {
    const message = (err as any)?.message ?? '';
    if (message.includes('Auth session missing')) {
      console.warn('[Auth] Sign-out skipped because no session was present.');
      return;
    }
    throw err;
  }
}
