"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Mail, Lock, ArrowRight, Shield } from "lucide-react";
import Link from "next/link";

export default function AdminLoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const { login } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setNotice(null);
        try {
            const result = await login(email, password);
            if (result.mode === "password") {
                router.push("/master/admin");
            } else {
                setNotice("Check your email for a secure admin login link.");
            }
        } catch (error: any) {
            setNotice(error?.message || "Authentication failed.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-950 p-4">
            <div className="w-full max-w-[400px]">
                <div className="mb-8 text-center">
                    <Link href="/" className="inline-flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-white rounded flex items-center justify-center">
                            <div className="w-3 h-3 bg-neutral-950 rounded-full" />
                        </div>
                        <span className="text-2xl font-bold text-white tracking-tight">Businto</span>
                    </Link>
                </div>

                <Card className="border border-white/10 bg-neutral-900 rounded-lg">
                    <CardHeader className="pb-6 text-center">
                        <div className="mx-auto w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center mb-3 text-indigo-400">
                            <Shield size={20} />
                        </div>
                        <CardTitle className="text-xl font-semibold text-white">Admin Portal</CardTitle>
                        <CardDescription className="text-neutral-400 text-sm">
                            Authorized personnel only. All activity is logged.
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {notice && (
                                <div className="text-sm rounded border border-white/10 bg-white/5 px-3 py-2 text-neutral-200">
                                    {notice}
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <Label htmlFor="email" className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={15} />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="admin@businto.com"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="h-10 pl-9 bg-black/20 border-white/10 text-white placeholder:text-neutral-700 focus:border-indigo-500 focus:ring-0 rounded"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="password" className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Password</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={15} />
                                    <Input
                                        id="password"
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="h-10 pl-9 bg-black/20 border-white/10 text-white focus:border-indigo-500 focus:ring-0 rounded"
                                    />
                                </div>
                            </div>
                            <Button
                                type="submit"
                                className="w-full h-10 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded transition-colors gap-2"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (
                                    <Loader2 className="animate-spin" size={16} />
                                ) : (
                                    <>
                                        Sign In
                                        <ArrowRight size={16} />
                                    </>
                                )}
                            </Button>
                        </form>
                    </CardContent>

                    <CardFooter className="pt-2 pb-6 justify-center">
                        <Link href="/login" className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
                            Return to standard login
                        </Link>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
