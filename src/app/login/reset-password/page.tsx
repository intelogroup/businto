"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { updatePassword } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
function ResetPasswordContent() {
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // null = checking, true = session ready, false = no session/expired
    const [sessionReady, setSessionReady] = useState<boolean | null>(null);
    const router = useRouter();

    useEffect(() => {
        console.log("[ResetPassword] Page mounted, checking session...");
        let isMounted = true;
        const supabase = createClient();

        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!isMounted) return;

            if (session) {
                console.log("[ResetPassword] Session found immediately, user:", session.user?.email);
                setSessionReady(true);
            } else {
                console.warn("[ResetPassword] No session found yet — listening for onAuthStateChange...");

                const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
                    console.log("[ResetPassword] onAuthStateChange event:", event, session?.user?.email);
                    if (!isMounted) return;

                    if (session || event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
                        console.log("[ResetPassword] Valid session or recovery event received, showing form");
                        setSessionReady(true);
                    }
                });

                // Give it 5s then declare expired/failed
                const timeout = setTimeout(() => {
                    if (isMounted) {
                        console.warn("[ResetPassword] Timeout reached. Still no session. Link may be expired or cross-site issues.");
                        setSessionReady((prev) => prev === null ? false : prev);
                    }
                }, 5000);

                return () => {
                    subscription.unsubscribe();
                    clearTimeout(timeout);
                };
            }
        };

        checkSession();

        return () => {
            isMounted = false;
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log("[ResetPassword] handleSubmit triggered");

        if (password.length < 8) {
            console.warn("[ResetPassword] Validation failed: password too short");
            toast.error("Password must be at least 8 characters.");
            return;
        }
        if (password !== confirm) {
            console.warn("[ResetPassword] Validation failed: passwords mismatch");
            toast.error("Passwords do not match.");
            return;
        }

        setIsSubmitting(true);
        console.log("[ResetPassword] Submitting new password...");
        try {
            console.log("[ResetPassword] Calling updatePassword core function...");
            await updatePassword(password);
            console.log("[ResetPassword] Password updated successfully, showing toast and redirecting...");
            toast.success("Password updated! Redirecting to sign in…");
            setTimeout(() => {
                console.log("[ResetPassword] Executing programmatic redirect to /login");
                router.push("/login");
            }, 1500);
        } catch (error: any) {
            console.error("[ResetPassword] updatePassword caught error in handleSubmit:", error);
            const errorDetails = {
                message: error?.message,
                status: error?.status,
                name: error?.name,
                code: error?.code,
                ...error
            };
            console.error("[ResetPassword] Formatted Error Details:", errorDetails);
            const msg = friendlyPasswordError(error?.message);
            toast.error(msg);
        } finally {
            console.log("[ResetPassword] handleSubmit finished, setting isSubmitting to false");
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-100/50 blur-[100px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-neutral-200/50 blur-[100px] rounded-full" />
            </div>

            <div className="w-full max-w-[440px] z-10">
                <div className="mb-10 text-center">
                    <a href="/" className="inline-flex items-center gap-3 group">
                        <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center transition-colors duration-150 duration-200 group- shadow-sm">
                            <img src="/brand-mark.svg" alt="Businto" className="w-8 h-8" />
                        </div>
                        <h1 className="text-3xl font-semibold text-neutral-950 tracking-tight">Businto</h1>
                    </a>
                </div>

                <Card className="border-none shadow-sm bg-white">
                    <CardHeader className="space-y-1 pb-8 text-center">
                        <CardTitle className="text-2xl font-bold tracking-tight text-neutral-900">Set new password</CardTitle>
                        <CardDescription className="text-neutral-500 font-medium">
                            {sessionReady === false
                                ? "This link has expired or already been used."
                                : "Choose a strong password of at least 8 characters."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {/* Waiting for Supabase PASSWORD_RECOVERY event */}
                        {sessionReady === null && (
                            <div className="flex justify-center py-8">
                                <Loader2 className="animate-spin text-neutral-400" size={28} />
                            </div>
                        )}

                        {/* Link expired or already used */}
                        {sessionReady === false && (
                            <div className="flex flex-col items-center gap-4 py-4 text-center">
                                <AlertCircle className="text-red-400" size={40} />
                                <p className="text-sm text-neutral-600">
                                    Please request a new reset link.
                                </p>
                                <Link
                                    href="/login/forgot-password"
                                    className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                                >
                                    Send a new link →
                                </Link>
                            </div>
                        )}

                        {/* Session confirmed — show the form */}
                        {sessionReady === true && (
                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div className="space-y-2">
                                    <Label htmlFor="password" className="text-xs font-semibold text-neutral-600 ml-1">New password</Label>
                                    <div className="relative group">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-black transition-colors" size={18} />
                                        <Input
                                            id="password"
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Minimum 8 characters"
                                            required
                                            minLength={8}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="h-10 pl-12 pr-12 bg-white border-neutral-200 focus:border-black focus:ring-0 rounded-md"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((v) => !v)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black"
                                            tabIndex={-1}
                                        >
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirm" className="text-xs font-semibold text-neutral-600 ml-1">Confirm password</Label>
                                    <div className="relative group">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-black transition-colors" size={18} />
                                        <Input
                                            id="confirm"
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Repeat your password"
                                            required
                                            value={confirm}
                                            onChange={(e) => setConfirm(e.target.value)}
                                            className="h-10 pl-12 bg-white border-neutral-200 focus:border-black focus:ring-0 rounded-md"
                                        />
                                    </div>
                                </div>
                                <Button
                                    type="submit"
                                    className="w-full h-10 bg-neutral-950 hover:bg-black text-white font-semibold rounded-md transition-colors"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : "Update password"}
                                </Button>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function friendlyPasswordError(message?: string): string {
    if (!message) return "Failed to update password. Please try again.";
    if (message.includes("same password")) return "New password must be different from your current one.";
    if (message.includes("weak")) return "Password is too weak. Use a mix of letters, numbers, and symbols.";
    if (message.includes("session")) return "Your reset link has expired. Please request a new one.";
    return "Failed to update password. Please try again.";
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#F9FAFB]" />}>
            <ResetPasswordContent />
        </Suspense>
    );
}
