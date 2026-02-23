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
    let profileName: string | undefined;
    let profileRole: User["role"] = "user";
    let profileAvatar: string | undefined;

    const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role, avatar_url")
        .eq("id", authUser.id)
        .maybeSingle();

    if (profile) {
        profileName = profile.full_name || undefined;
        profileRole = normalizeRole(profile.role);
        profileAvatar = profile.avatar_url || undefined;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const init = async () => {
            setIsLoading(true);
            const { data } = await supabase.auth.getSession();
            if (!isMounted) return;

            setSession(data.session);
            if (data.session?.user) {
                const mapped = await mapSupabaseUser(data.session.user);
                if (!isMounted) return;
                setUser(mapped);
            } else {
                setUser(null);
            }
            setIsLoading(false);
        };

        init();

        const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
            if (!isMounted) return;
            setSession(nextSession);
            if (nextSession?.user) {
                const mapped = await mapSupabaseUser(nextSession.user);
                if (!isMounted) return;
                setUser(mapped);
            } else {
                setUser(null);
            }
            setIsLoading(false);
        });

        return () => {
            isMounted = false;
            authListener.subscription.unsubscribe();
        };
    }, []);

    const login = async (email: string, password?: string) => {
        setIsLoading(true);
        try {
            if (password && password.trim().length > 0) {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) throw error;

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

            if (error) throw error;
            return { mode: "magic_link" as const };
        } finally {
            setIsLoading(false);
        }
    };

    const signup = async (email: string, password: string, fullName: string) => {
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

            if (error) throw error;

            if (data.user) {
                await supabase.from("profiles").upsert({
                    id: data.user.id,
                    full_name: fullName,
                    role: "user",
                });

                const mapped = await mapSupabaseUser(data.user);
                setUser(mapped);
            }
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
