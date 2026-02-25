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

function mapAuthError(message?: string): string {
    if (!message) return "Sign in failed. Please try again.";
    if (message.includes("Invalid login credentials") || message.includes("invalid_credentials"))
        return "Incorrect email or password. Please check your credentials.";
    if (message.includes("Email not confirmed"))
        return "Please verify your email before signing in.";
    if (message.includes("rate limit") || message.includes("too many"))
        return "Too many attempts. Please wait a moment and try again.";
    if (message.includes("network") || message.includes("fetch"))
        return "Network error. Check your connection and try again.";
    return message;
}

function LoginContent() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const { login } = useAuth();
    const searchParams = useSearchParams();
    const router = useRouter();
    const redirect = searchParams.get("redirect");

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
            const result = await login(email, password);
            console.log("[Login Page] Login result:", result);

            if (result.mode === "password") {
                console.log("[Login Page] Password login successful, redirecting to:", redirect || "/dashboard");
                router.push(redirect || "/dashboard");
            } else {
                toast.success("Check your email for a secure sign-in link.");
            }
        } catch (error: any) {
            console.error("[Login Page] Login error caught:", error);
            setErrorMsg(mapAuthError(error?.message));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] p-4 relative overflow-hidden">
            {/* Background patterns */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-100/50 blur-[100px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-neutral-200/50 blur-[100px] rounded-full" />
            </div>

            <div className="w-full max-w-[440px] z-10">
                <div className="mb-10 text-center">
                    <Link href="/" className="inline-flex items-center gap-3 group">
                        <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center transition-all duration-200 group-hover:scale-105 shadow-sm">
                            <img src="/brand-mark.svg" alt="Businto" className="w-8 h-8" />
                        </div>
                        <h1 className="text-3xl font-semibold text-neutral-950 tracking-tight">Businto</h1>
                    </Link>
                </div>

                <Card className="border-none shadow-sm bg-white transition-colors duration-150">
                    <CardHeader className="space-y-1 pb-8 text-center">
                        <CardTitle className="text-2xl font-bold tracking-tight text-neutral-900">Welcome back</CardTitle>
                        <CardDescription className="text-neutral-500 font-medium">
                            Enter your credentials to access your operator dashboard
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6">
                        {errorMsg && (
                            <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-md text-sm flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>{errorMsg}</span>
                            </div>
                        )}
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-xs font-semibold text-neutral-600 ml-1">Email</Label>
                                <div className="relative group">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-black transition-colors duration-150" size={18} />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="alex@example.com"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="h-10 pl-12 bg-white border-neutral-200 focus:border-black focus:ring-0 transition-colors duration-150 rounded-md"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between ml-1">
                                    <Label htmlFor="password" className="text-xs font-semibold text-neutral-600">Password</Label>
                                    <Link href="/login/forgot-password" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">Forgot?</Link>
                                </div>
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-black transition-colors duration-150" size={18} />
                                    <Input
                                        id="password"
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="h-10 pl-12 bg-white border-neutral-200 focus:border-black focus:ring-0 transition-colors duration-150 rounded-md"
                                    />
                                </div>
                            </div>
                            <Button
                                type="submit"
                                className="w-full h-10 bg-neutral-950 hover:bg-black text-white font-semibold rounded-md transition-colors duration-150 gap-2"
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
                    <CardFooter className="pt-4 pb-8 justify-center">
                        <p className="text-sm text-neutral-500 font-medium">
                            Don&apos;t have an account? <Link href="/signup" className="text-black font-bold hover:underline">Sign Up</Link>
                        </p>
                    </CardFooter>
                </Card>

                <div className="mt-8 text-center text-xs text-neutral-400 font-semibold">
                    Secure Infrastructure Provided by Businto
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
