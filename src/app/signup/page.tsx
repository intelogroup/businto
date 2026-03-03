"use client";

import { Suspense, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, Lock, ArrowRight, User, ShieldCheck, AlertCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/auth-errors";


function SignupContent() {
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const { signup } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrorMsg(null);
        try {
            await signup(email, password, fullName);
            toast.success("Account created! Welcome to Businto.");
            router.push("/dashboard");
        } catch (error: any) {
            setErrorMsg(getErrorMessage(error?.message, "signup"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] p-4 relative overflow-hidden">
            {/* Background patterns */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100/50 blur-[100px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-neutral-200/50 blur-[100px] rounded-full" />
            </div>

            <div className="w-full max-w-[440px] z-10">
                <div className="mb-10 text-center">
                    <Link href="/" className="inline-flex items-center gap-3 group">
                        <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center transition-colors duration-150 duration-200 group- shadow-sm">
                            <img src="/brand-mark.svg" alt="Businto" className="w-8 h-8" />
                        </div>
                        <h1 className="text-3xl font-semibold text-neutral-950 tracking-tight">Businto</h1>
                    </Link>
                </div>

                <Card className="border-none shadow-sm bg-white transition-colors duration-150">
                    <CardHeader className="space-y-1 pb-8 text-center">
                        <CardTitle className="text-2xl font-bold tracking-tight text-neutral-900">Create account</CardTitle>
                        <CardDescription className="text-neutral-500 font-medium">
                            Join the network and start dispatching smarter
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
                                <Label htmlFor="fullName" className="text-xs font-semibold text-neutral-600 ml-1">Full Name</Label>
                                <div className="relative group">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-black transition-colors duration-150" size={18} />
                                    <Input
                                        id="fullName"
                                        type="text"
                                        placeholder="Alex Johnson"
                                        required
                                        value={fullName}
                                        onChange={(e) => {
                                            setFullName(e.target.value);
                                            setErrorMsg(null);
                                        }}
                                        className="h-10 pl-12 bg-white border-neutral-200 focus:border-black focus:ring-0 transition-colors duration-150 rounded-md"
                                    />
                                </div>
                            </div>
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
                                        onChange={(e) => {
                                            setEmail(e.target.value);
                                            setErrorMsg(null);
                                        }}
                                        className="h-10 pl-12 bg-white border-neutral-200 focus:border-black focus:ring-0 transition-colors duration-150 rounded-md"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-xs font-semibold text-neutral-600 ml-1">Password</Label>
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-black transition-colors duration-150" size={18} />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="Minimum 8 characters"
                                        required
                                        minLength={8}
                                        value={password}
                                        onChange={(e) => {
                                            setPassword(e.target.value);
                                            setErrorMsg(null);
                                        }}
                                        className="h-10 pl-12 bg-white border-neutral-200 focus:border-black focus:ring-0 transition-colors duration-150 rounded-md"
                                    />
                                </div>
                            </div>
                            <div className="pt-2">
                                <Button
                                    type="submit"
                                    className="w-full h-10 bg-neutral-950 hover:bg-black text-white font-semibold rounded-md transition-colors duration-150 gap-2"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? (
                                        <Loader2 className="animate-spin" size={18} />
                                    ) : (
                                        <>
                                            Complete Signup
                                            <ArrowRight size={18} />
                                        </>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                    <CardFooter className="pt-4 pb-8 justify-center flex flex-col gap-4">
                        <div className="flex items-center gap-2 text-[10px] text-neutral-400 font-bold uppercase tracking-widest">
                            <ShieldCheck size={14} />
                            Enterprise Grade Security
                        </div>
                        <p className="text-sm text-neutral-500 font-medium">
                            Already have an account? <Link href="/login" className="text-black font-bold hover:underline">Log In</Link>
                        </p>
                    </CardFooter>
                </Card>

                <div className="mt-8 text-center text-xs text-neutral-400 font-semibold">
                    By signing up, you agree to our Terms of Service
                </div>
            </div>
        </div>
    );
}

export default function SignupPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#F9FAFB]" />}>
            <SignupContent />
        </Suspense>
    );
}
