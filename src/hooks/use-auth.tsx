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

        console.log("[Auth] Setting up auth state listener...");

        // Use onAuthStateChange as the single source of truth for session state.
        // It fires immediately with the current session upon subscription.
        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
            console.log("[Auth] onAuthStateChange event:", event, "session:", !!nextSession);

            if (!isMounted) return;

            setSession(nextSession);

            if (nextSession?.user) {
                // Enrich user state concurrently without blocking the SDK's thread/promise
                mapSupabaseUser(nextSession.user, supabase)
                    .then((mapped) => {
                        if (isMounted) {
                            console.log("[Auth] User mapping successful, id:", mapped.id);
                            setUser(mapped);
                            setIsLoading(false);
                        }
                    })
                    .catch((err) => {
                        console.error("[Auth] Error mapping user:", err);
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
                console.log("[Auth] Loading timeout reached, force-stopping loading state");
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
        console.log("[Auth] login method called for:", email, "with password:", !!password);
        // We don't set isLoading(true) here because onAuthStateChange will handle it 
        // if a session is successfully created.
        try {
            if (password && password.trim().length > 0) {
                console.log("[Auth] Executing signInWithPassword...");
                const result = await signInWithPassword(email, password, supabase);
                console.log("[Auth] signInWithPassword result user:", !!result.user);
                // State will be updated by onAuthStateChange listener
                return { mode: "password" as const };
            }

            console.log("[Auth] Executing sendMagicLink...");
            await sendMagicLink(email, redirectTo, supabase);
            return { mode: "magic_link" as const };
        } catch (err) {
            console.error("[Auth] login method error:", err);
            throw err;
        }
    };

    const signup = async (email: string, password: string, fullName: string) => {
        console.log("[Auth] Signup attempt for:", email);
        // State will be updated by onAuthStateChange listener if successful
        await registerUser(email, password, fullName, supabase);
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            console.log('[Auth] Initiating sign-out...');
            await signOutUser();
            console.log('[Auth] Sign-out completed');
        } catch (err) {
            console.error('[Auth] Logout error:', err);
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
