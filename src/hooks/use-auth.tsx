"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
    AuthUser,
    mapSupabaseUser,
    registerUser,
    sendMagicLink,
    signInWithPassword,
    signOutUser,
} from "@/lib/auth";

interface AuthContextType {
    user: AuthUser | null;
    session: Session | null;
    isLoading: boolean;
    login: (email: string, password?: string) => Promise<{ mode: "password" | "magic_link" }>;
    signup: (email: string, password: string, fullName: string) => Promise<void>;
    logout: () => Promise<void>;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
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
                    const mapped = await mapSupabaseUser(data.session.user);
                    if (!isMounted) return;
                    setUser(mapped);
                } else {
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
        console.log("[Auth] Login attempt for:", email);
        setIsLoading(true);
        try {
            if (password && password.trim().length > 0) {
                const data = await signInWithPassword(email, password);
                setSession(data.session);
                if (data.user) {
                    const mapped = await mapSupabaseUser(data.user);
                    setUser(mapped);
                }
                return { mode: "password" as const };
            }

            await sendMagicLink(email);
            return { mode: "magic_link" as const };
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
