"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, Lock, ArrowRight, Shield, LayoutDashboard, KeyRound } from "lucide-react";
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
                router.push("/admin");
            } else {
                setNotice("Check your email for a secure admin login link.");
            }
        } catch (error: any) {
            setNotice(error?.message || "Authentication failed.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const fillAdminEmail = (value: string) => setEmail(value);

    return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-950 p-4 relative overflow-hidden">
            {/* Background patterns */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full" />
            </div>

            <div className="w-full max-w-[440px] z-10">
                <div className="mb-10 text-center">
                    <Link href="/" className="inline-flex items-center gap-3 group">
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center group-hover:scale-105 group-hover:rotate-3 transition-all duration-300 shadow-xl shadow-white/5">
                            <div className="w-5 h-5 bg-neutral-950 rounded-full animate-pulse" />
                        </div>
                        <h1 className="text-3xl font-black text-white tracking-tighter">Businto</h1>
                    </Link>
                </div>

                <Card className="border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-neutral-900/50 backdrop-blur-xl transition-all duration-300 rounded-[32px]">
                    <CardHeader className="space-y-1 pb-8 text-center">
                        <div className="mx-auto w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4 text-indigo-400">
                            <Shield size={24} />
                        </div>
                        <CardTitle className="text-2xl font-bold tracking-tight text-white">Admin Portal</CardTitle>
                        <CardDescription className="text-neutral-400 font-medium">
                            Authorized personnel only. System activity is logged.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6">
                        {/* Mock Login Buttons */}
                        <div className="grid grid-cols-2 gap-4">
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() => fillAdminEmail("jimkalinov@gmail.com")}
                                className="h-14 border-white/10 bg-white/5 hover:bg-white/10 hover:border-indigo-500/50 hover:text-indigo-400 text-neutral-300 transition-all font-semibold gap-2 rounded-2xl flex-col items-center justify-center px-0"
                            >
                                <span className="text-[10px] uppercase tracking-widest font-black opacity-50">Demo</span>
                                <div className="flex items-center gap-2">
                                    <KeyRound size={16} />
                                    Admin
                                </div>
                            </Button>
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() => fillAdminEmail("manager@businto.com")}
                                className="h-14 border-white/10 bg-white/5 hover:bg-white/10 hover:border-emerald-500/50 hover:text-emerald-400 text-neutral-300 transition-all font-semibold gap-2 rounded-2xl flex-col items-center justify-center px-0"
                            >
                                <span className="text-[10px] uppercase tracking-widest font-black opacity-50">Demo</span>
                                <div className="flex items-center gap-2">
                                    <LayoutDashboard size={16} />
                                    Manager
                                </div>
                            </Button>
                        </div>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-white/10" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-transparent px-3 text-neutral-600 font-bold tracking-widest">Or secure login</span>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            {notice && (
                                <div className="text-xs rounded-md border border-white/10 bg-white/5 px-3 py-2 text-neutral-200">
                                    {notice}
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-neutral-500 ml-1">Email</Label>
                                <div className="relative group">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-white transition-colors" size={18} />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="admin@businto.com"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="h-12 pl-12 bg-black/20 border-white/10 text-white placeholder:text-neutral-700 focus:border-indigo-500 focus:ring-0 transition-all rounded-xl"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between ml-1">
                                    <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-neutral-500">Password</Label>
                                </div>
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-white transition-colors" size={18} />
                                    <Input
                                        id="password"
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="h-12 pl-12 bg-black/20 border-white/10 text-white focus:border-indigo-500 focus:ring-0 transition-all rounded-xl"
                                    />
                                </div>
                            </div>
                            <Button
                                type="submit"
                                className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold uppercase tracking-widest rounded-xl transition-all shadow-[0_10px_30px_-10px_rgba(79,70,229,0.5)] hover:shadow-[0_15px_30px_-5px_rgba(79,70,229,0.6)] active:scale-[0.98] gap-2"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (
                                    <Loader2 className="animate-spin" size={18} />
                                ) : (
                                    <>
                                        Authenticate
                                        <ArrowRight size={18} />
                                    </>
                                )}
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter className="pt-4 pb-8 justify-center">
                        <Link href="/login" className="text-sm text-neutral-500 font-medium hover:text-white transition-colors">
                            Return to standard login
                        </Link>
                    </CardFooter>
                </Card>

                <div className="mt-8 text-center text-[11px] text-neutral-600 font-bold uppercase tracking-[0.2em]">
                    Restricted Area • ID: {Math.random().toString(36).substr(2, 6).toUpperCase()}
                </div>
            </div>
        </div>
    );
}
