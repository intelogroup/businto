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
    login: (email: string, password?: string) => Promise<{ mode: "password" | "magic_link" }>;
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
    const supabase = createClient();

    useEffect(() => {
        let isMounted = true;

        const init = async () => {
            console.log("[Auth] Initializing session...");
            setIsLoading(true);
            try {
                // getClaims() validates the JWT signature — never trust getSession() in server code.
                // On the client we still use it to hydrate initial state, but prefer getClaims.
                const { data, error } = await supabase.auth.getClaims();
                const claims = data?.claims;
                console.log("[Auth] Initial claims check:", {
                    hasClaims: !!claims,
                    userId: claims?.sub,
                    error
                });

                if (error) {
                    console.error("[Auth] getClaims error:", error);
                }

                if (!isMounted) return;

                if (claims?.sub) {
                    // Build a minimal SupabaseAuthUser shape from claims to pass to mapSupabaseUser
                    const { data: sessionData } = await supabase.auth.getSession();
                    setSession(sessionData.session);
                    if (sessionData.session?.user) {
                        console.log("[Auth] Mapping user profile for:", sessionData.session.user.id);
                        const mapped = await mapSupabaseUser(sessionData.session.user);
                        console.log("[Auth] Mapped user:", mapped);
                        if (!isMounted) return;
                        setUser(mapped);
                    }
                } else {
                    setSession(null);
                    setUser(null);
                }
            } catch (err) {
                console.error("[Auth] initialization catch block:", err);
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
                    const mapped = await mapSupabaseUser(nextSession.user);
                    if (!isMounted) return;
                    setUser(mapped);
                } else {
                    setUser(null);
                }
            } catch (err) {
                console.error("[Auth] onAuthStateChange error:", err);
            } finally {
                setIsLoading(false);
            }
        });

        return () => {
            isMounted = false;
            authListener.subscription.unsubscribe();
        };
    }, []);

    const login = async (email: string, password?: string) => {
        console.log("[Auth] login method called for:", email, "with password:", !!password);
        setIsLoading(true);
        try {
            if (password && password.trim().length > 0) {
                console.log("[Auth] Executing signInWithPassword...");
                const data = await signInWithPassword(email, password);
                console.log("[Auth] signInWithPassword result session:", !!data.session);

                setSession(data.session);
                if (data.user) {
                    console.log("[Auth] Mapping user profile...");
                    const mapped = await mapSupabaseUser(data.user);
                    console.log("[Auth] Final user object set:", mapped);
                    setUser(mapped);
                }
                return { mode: "password" as const };
            }

            console.log("[Auth] Executing sendMagicLink...");
            await sendMagicLink(email);
            return { mode: "magic_link" as const };
        } catch (err) {
            console.error("[Auth] login method error:", err);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const signup = async (email: string, password: string, fullName: string) => {
        console.log("[Auth] Signup attempt for:", email);
        setIsLoading(true);
        try {
            const data = await registerUser(email, password, fullName);
            if (data.user) {
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
            if (!session) {
                console.warn('[Auth] Logout request ignored because no active session');
                setUser(null);
                setSession(null);
                return;
            }
            console.log('[Auth] Logging out user', user?.id);
            await signOutUser();
            console.log('[Auth] Sign-out completed');
            setSession(null);
            setUser(null);
        } finally {
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
