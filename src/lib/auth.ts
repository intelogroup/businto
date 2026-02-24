import type { Session, User as SupabaseAuthUser } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "operator" | "user";
  avatar?: string;
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
  return process.env.NEXT_PUBLIC_APP_URL || "https://businto.vercel.app";
}

export async function mapSupabaseUser(
  authUser: SupabaseAuthUser,
  supabaseClient = supabase
): Promise<AuthUser> {
  let profileName: string | undefined;
  let profileRole: AuthUser["role"] = "user";
  let profileAvatar: string | undefined;

  try {
    const { data: profile, error } = await supabaseClient
      .from("profiles")
      .select("full_name, role, avatar_url")
      .eq("id", authUser.id)
      .maybeSingle();

    if (error) {
      console.warn("[Auth] Profile query error (continuing with metadata):", error.message);
    } else if (profile) {
      console.log("[Auth] Profile found:", profile);
      profileName = profile.full_name || undefined;
      profileRole = normalizeRole(profile.role);
      profileAvatar = profile.avatar_url || undefined;
    } else {
      console.log("[Auth] No profile found for user ID:", authUser.id);
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
  };
}

export async function signInWithPassword(
  email: string,
  password: string,
  supabaseClient = supabase
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
  supabaseClient = supabase
) {
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${getFrontendOrigin()}/dashboard`,
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
  supabaseClient = supabase
) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
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
 * Sends a password reset email. The link redirects directly to
 * `/login/reset-password` so the browser receives the #access_token fragment
 * and the Supabase client fires the PASSWORD_RECOVERY auth state event.
 *
 * IMPORTANT: `https://businto.vercel.app/login/reset-password` (and the
 * localhost equivalent) must be listed in Supabase Dashboard →
 * Authentication → URL Configuration → Redirect URLs, otherwise Supabase
 * will reject the redirectTo and send the user to the site root with an
 * `error=access_denied` query param.
 */
export async function resetPasswordForEmail(
  email: string,
  supabaseClient = supabase
) {
  // Redirect directly to the reset page so the client SDK can process the
  // #access_token fragment and fire the PASSWORD_RECOVERY auth state event.
  // Do NOT route through /api/auth/callback — the server cannot pass the
  // fragment to the client, which would prevent the form from appearing.
  const redirectTo = `${getFrontendOrigin()}/login/reset-password`;
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
  supabaseClient = supabase
) {
  const { data, error } = await supabaseClient.auth.updateUser({
    password: newPassword,
  });
  if (error) {
    throw error;
  }
  return data;
}

export async function signOutUser(supabaseClient = supabase) {
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
