"use client";

import { Suspense, useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, Lock, ArrowRight, AlertCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/auth-errors";


function LoginContent() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const { login, isAuthenticated, isLoading } = useAuth();
    const searchParams = useSearchParams();
    const router = useRouter();
    const redirect = searchParams.get("redirect");

    // PERSISTENCE GUARD: If already logged in, skip the login page entirely
    useEffect(() => {
        if (!isLoading && isAuthenticated) {
            console.log("[Login Page] User already authenticated, redirecting to:", redirect || "/dashboard");
            router.replace(redirect || "/dashboard");
        }
    }, [isAuthenticated, isLoading, router, redirect]);

    useEffect(() => {
        if (searchParams.get("error") === "auth_callback_failed") {
            toast.error("The link has expired or is invalid. Please request a new one.");
        }
    }, [searchParams]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrorMsg(null);
        try {
            console.log("[Login Page] Form submitted for:", email);
            const result = await login(email, password, redirect || undefined);
            console.log("[Login Page] Login result:", result);

            if (result.mode === "password") {
                console.log("[Login Page] Password login successful, redirecting to:", redirect || "/dashboard");
                router.push(redirect || "/dashboard");
            } else {
                toast.success("Check your email for a secure sign-in link.");
            }
        } catch (error: any) {
            console.error("[Login Page] Login error caught:", error);
            setErrorMsg(getErrorMessage(error?.message, "login"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4">
            <div className="w-full max-w-[400px]">
                <div className="mb-10 text-center">
                    <Link href="/" className="inline-flex items-center gap-3 group">
                        <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center transition-colors duration-150">
                            <img src="/brand-mark.svg" alt="Businto" className="w-7 h-7" />
                        </div>
                        <h1 className="text-2xl font-semibold text-neutral-950 tracking-tight">Businto</h1>
                    </Link>
                </div>

                <Card className="border border-neutral-200 shadow-sm bg-white overflow-hidden">
                    <CardHeader className="space-y-1.5 pb-6 text-center border-b border-neutral-100 bg-white/50">
                        <CardTitle className="text-xl font-semibold tracking-tight text-neutral-900">Welcome back</CardTitle>
                        <CardDescription className="text-neutral-500 text-sm">
                            Access your private transport dashboard
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6 pt-8">
                        {errorMsg && (
                            <div className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-md text-sm flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>{errorMsg}</span>
                            </div>
                        )}
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-1.5">
                                <Label htmlFor="email" className="text-xs font-medium text-neutral-500 ml-1">Email Address</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="alex@example.com"
                                        required
                                        value={email}
                                        onChange={(e) => {
                                            setEmail(e.target.value);
                                            setErrorMsg(null);
                                        }}
                                        className="h-10 pl-10 rounded-md"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between ml-1">
                                    <Label htmlFor="password" className="text-xs font-medium text-neutral-500">Password</Label>
                                    <Link href="/login/forgot-password" university-none className="text-xs font-medium text-neutral-400 hover:text-neutral-900">Forgot password?</Link>
                                </div>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                                    <Input
                                        id="password"
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => {
                                            setPassword(e.target.value);
                                            setErrorMsg(null);
                                        }}
                                        className="h-10 pl-10 rounded-md"
                                    />
                                </div>
                            </div>
                            <Button
                                type="submit"
                                className="w-full h-10 bg-neutral-900 hover:bg-black text-white font-semibold rounded-md shadow-sm transition-colors duration-150 gap-2 mt-2"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (
                                    <Loader2 className="animate-spin" size={18} />
                                ) : (
                                    <>
                                        Sign In
                                        <ArrowRight size={18} />
                                    </>
                                )}
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter className="pt-2 pb-8 flex justify-center border-t border-neutral-50 mt-4 bg-white/30">
                        <p className="text-sm text-neutral-500">
                            Don&apos;t have an account? <Link href="/signup" className="text-neutral-900 font-semibold hover:underline">Create Account</Link>
                        </p>
                    </CardFooter>
                </Card>

                <div className="mt-12 text-center text-[10px] text-neutral-400 font-medium uppercase tracking-widest">
                    Enterprise Grade Infrastructure
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#F9FAFB]" />}>
            <LoginContent />
        </Suspense>
    );
}
