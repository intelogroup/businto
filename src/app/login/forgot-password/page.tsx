"use client";

import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { resetPasswordForEmail } from "@/lib/auth";

function ForgotPasswordContent() {
    const [email, setEmail] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log("[ForgotPassword] Submitting reset request for:", email);
        setIsSubmitting(true);
        try {
            await resetPasswordForEmail(email);
            console.log("[ForgotPassword] Reset email sent successfully to:", email);
            setSent(true);
        } catch (error: any) {
            console.error("[ForgotPassword] resetPasswordForEmail failed:", error);
            const errorDetails = {
                message: error?.message,
                status: error?.status,
                name: error?.name,
                code: error?.code,
                ...error
            };
            console.error("[ForgotPassword] Formatted Error Details:", errorDetails);

            if (error?.code === "over_email_send_rate_limit") {
                toast.error("Too many requests. Please wait a few minutes before trying again.");
            } else {
                toast.error("Something went wrong. Please try again.");
            }
        } finally {
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
                    <Link href="/" className="inline-flex items-center gap-3 group">
                        <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center transition-colors duration-150 duration-200 group- shadow-sm">
                            <img src="/brand-mark.svg" alt="Businto" className="w-8 h-8" />
                        </div>
                        <h1 className="text-3xl font-semibold text-neutral-950 tracking-tight">Businto</h1>
                    </Link>
                </div>

                <Card className="border-none shadow-sm bg-white">
                    <CardHeader className="space-y-1 pb-8 text-center">
                        <CardTitle className="text-2xl font-bold tracking-tight text-neutral-900">Reset password</CardTitle>
                        <CardDescription className="text-neutral-500 font-medium">
                            {sent
                                ? "Check your inbox for the reset link."
                                : "Enter your email and we'll send you a reset link."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {sent ? (
                            <div className="flex flex-col items-center gap-4 py-4">
                                <CheckCircle2 className="text-green-500" size={40} />
                                <p className="text-sm text-neutral-600 text-center">
                                    If <span className="font-semibold">{email}</span> is registered, you'll receive a link shortly.
                                </p>
                                <Link
                                    href="/login"
                                    className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                                >
                                    <ArrowLeft size={14} /> Back to sign in
                                </Link>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-xs font-semibold text-neutral-600 ml-1">Email address</Label>
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
                                <Button
                                    type="submit"
                                    className="w-full h-10 bg-neutral-950 hover:bg-black text-white font-semibold rounded-md transition-colors duration-150"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : "Send reset link"}
                                </Button>
                                <div className="text-center">
                                    <Link
                                        href="/login"
                                        className="text-sm font-semibold text-neutral-500 hover:text-neutral-800 flex items-center justify-center gap-1"
                                    >
                                        <ArrowLeft size={14} /> Back to sign in
                                    </Link>
                                </div>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function ForgotPasswordPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#F9FAFB]" />}>
            <ForgotPasswordContent />
        </Suspense>
    );
}
