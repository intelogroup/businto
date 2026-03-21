"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
    AuthUser,
    mapSupabaseUser,
    registerUser,
    resetPasswordForEmail,
    sendMagicLink,
    signInWithPassword,
    signOutUser,
    updatePassword,
} from "@/lib/auth";

interface AuthContextType {
    user: AuthUser | null;
    session: Session | null;
    isLoading: boolean;
    login: (email: string, password?: string, redirectTo?: string) => Promise<{ mode: "password" | "magic_link" }>;
    signup: (email: string, password: string, fullName: string) => Promise<void>;
    logout: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    updateUserPassword: (newPassword: string) => Promise<void>;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [supabase] = useState(() => createClient());

    useEffect(() => {
        let isMounted = true;

        // Use onAuthStateChange as the single source of truth for session state.
        // It fires immediately with the current session upon subscription.
        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, nextSession) => {

            if (!isMounted) return;

            setSession(nextSession);

            if (nextSession?.user) {
                // Enrich user state concurrently without blocking the SDK's thread/promise
                mapSupabaseUser(nextSession.user, supabase)
                    .then((mapped) => {
                        if (isMounted) {
                            setUser(mapped);
                            setIsLoading(false);
                        }
                    })
                    .catch(() => {
                        if (isMounted) {
                            setUser(null);
                            setIsLoading(false);
                        }
                    });
            } else {
                setUser(null);
                setIsLoading(false);
            }
        });

        // Fallback safety: ensure loading stops even if listener hangs (unlikely with Supabase v2)
        const timeout = setTimeout(() => {
            if (isMounted && isLoading) {
                setIsLoading(false);
            }
        }, 5000);

        return () => {
            isMounted = false;
            authListener.subscription.unsubscribe();
            clearTimeout(timeout);
        };
    }, []);

    const login = async (email: string, password?: string, redirectTo?: string) => {
        // We don't set isLoading(true) here because onAuthStateChange will handle it
        // if a session is successfully created.
        if (password && password.trim().length > 0) {
            const result = await signInWithPassword(email, password, supabase);
            // State will be updated by onAuthStateChange listener
            return { mode: "password" as const };
        }

        await sendMagicLink(email, redirectTo, supabase);
        return { mode: "magic_link" as const };
    };

    const signup = async (email: string, password: string, fullName: string) => {
        // State will be updated by onAuthStateChange listener if successful
        await registerUser(email, password, fullName, supabase);
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            await signOutUser();
        } catch (err) {
        } finally {
            setSession(null);
            setUser(null);
            setIsLoading(false);
        }
    };

    const resetPassword = async (email: string) => {
        await resetPasswordForEmail(email);
    };

    const updateUserPassword = async (newPassword: string) => {
        await updatePassword(newPassword);
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
                resetPassword,
                updateUserPassword,
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
