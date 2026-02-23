"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import type { Session, User as SupabaseAuthUser } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface User {
    id: string;
    name: string;
    email: string;
    role: "admin" | "manager" | "operator" | "user";
    avatar?: string;
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    login: (email: string, password?: string) => Promise<{ mode: "password" | "magic_link" }>;
    signup: (email: string, password: string, fullName: string) => Promise<void>;
    logout: () => Promise<void>;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeRole(rawRole: unknown): User["role"] {
    if (rawRole === "admin" || rawRole === "manager" || rawRole === "operator") {
        return rawRole;
    }
    return "user";
}

async function mapSupabaseUser(authUser: SupabaseAuthUser): Promise<User> {
    console.log("[Auth] mapSupabaseUser called for:", authUser.id);
    let profileName: string | undefined;
    let profileRole: User["role"] = "user";
    let profileAvatar: string | undefined;

    try {
        console.log("[Auth] Querying profiles table...");
        const { data: profile, error } = await supabase
            .from("profiles")
            .select("full_name, role, avatar_url")
            .eq("id", authUser.id)
            .maybeSingle();

        if (error) {
            console.warn("[Auth] Profile query error (continuing with metadata):", error.message);
        } else if (profile) {
            console.log("[Auth] Profile data retrieved:", profile);
            profileName = profile.full_name || undefined;
            profileRole = normalizeRole(profile.role);
            profileAvatar = profile.avatar_url || undefined;
        } else {
            console.log("[Auth] No profile record found for this user.");
        }
    } catch (err) {
        console.error("[Auth] Critical error in mapSupabaseUser query:", err);
    }

    const derivedName =
        profileName ||
        authUser.user_metadata?.full_name ||
        authUser.email?.split("@")[0] ||
        "User";

    console.log("[Auth] Mapping complete for:", derivedName);

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const init = async () => {
            console.log("[Auth] Initializing session...");
            setIsLoading(true);
            try {
                const { data } = await supabase.auth.getSession();
                if (!isMounted) return;

                setSession(data.session);
                if (data.session?.user) {
                    console.log("[Auth] Session found for user:", data.session.user.id);
                    const mapped = await mapSupabaseUser(data.session.user);
                    if (!isMounted) return;
                    setUser(mapped);
                } else {
                    console.log("[Auth] No active session.");
                    setUser(null);
                }
            } catch (err) {
                console.error("[Auth] Initialization error:", err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        init();

        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
            console.log("[Auth] onAuthStateChange event:", event);
            if (!isMounted) return;

            setSession(nextSession);
            try {
                if (nextSession?.user) {
                    console.log("[Auth] User found in state change, mapping...");
                    const mapped = await mapSupabaseUser(nextSession.user);
                    if (!isMounted) return;
                    setUser(mapped);
                    console.log("[Auth] User state updated.");
                } else {
                    console.log("[Auth] No user in state change, clearing user state.");
                    setUser(null);
                }
            } catch (err) {
                console.error("[Auth] Error in onAuthStateChange handler:", err);
            } finally {
                console.log("[Auth] Loading finished.");
                setIsLoading(false);
            }
        });

        return () => {
            isMounted = false;
            authListener.subscription.unsubscribe();
        };
    }, []);

    const login = async (email: string, password?: string) => {
        console.log(`[Auth] Login attempt for ${email}${password ? " (password)" : " (magic link)"}`);
        setIsLoading(true);
        try {
            if (password && password.trim().length > 0) {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) {
                    console.error("[Auth] Password login error:", error.message);
                    throw error;
                }

                console.log("[Auth] Password login success");
                setSession(data.session);
                if (data.user) {
                    const mapped = await mapSupabaseUser(data.user);
                    setUser(mapped);
                }
                return { mode: "password" as const };
            }

            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: `${window.location.origin}/dashboard`,
                },
            });

            if (error) {
                console.error("[Auth] Magic link error:", error.message);
                throw error;
            }

            console.log("[Auth] Magic link sent");
            return { mode: "magic_link" as const };
        } catch (err) {
            console.error("[Auth] Login catch-all error:", err);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const signup = async (email: string, password: string, fullName: string) => {
        console.log("[Auth] Signup attempt for:", email);
        setIsLoading(true);
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                    },
                },
            });

            if (error) {
                console.error("[Auth] Signup error:", error.message);
                throw error;
            }

            console.log("[Auth] Signup success, creating profile...");
            if (data.user) {
                await supabase.from("profiles").upsert({
                    id: data.user.id,
                    full_name: fullName,
                    role: "user",
                });

                const mapped = await mapSupabaseUser(data.user);
                setUser(mapped);
            }
        } catch (err) {
            console.error("[Auth] Signup catch-all error:", err);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            setSession(null);
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                session,
                isLoading,
                login,
                signup,
                logout,
                isAuthenticated: !!user,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
