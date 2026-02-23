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
  return "http://localhost";
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
      profileName = profile.full_name || undefined;
      profileRole = normalizeRole(profile.role);
      profileAvatar = profile.avatar_url || undefined;
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
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

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
