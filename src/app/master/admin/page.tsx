"use client";

import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { Navbar } from "@/components/navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
    Users, MapPin, Bus, Activity as ActivityIcon,
    Shield, Search, MoreVertical, Radio, Send,
    AlertTriangle, Clock, Loader2, ToggleLeft, ToggleRight, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { useRouter, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DispatchOperator {
    id: string;
    company_name: string;
    company_email: string;
    is_partner: boolean;
    is_verified: boolean;
}

interface AdminStats {
    users: number;
    operators: number;
    activeRequests: number;
    totalBookings: number;
    totalRevenue: number;
}

interface AdminRequest {
    id: string;
    service_type: string;
    pickup_address: string;
    dropoff_address: string;
    status: string;
    created_at: string;
    user?: { full_name: string; email: string };
    quotes?: { count: number }[];
}

interface AdminUser {
    id: string;
    full_name: string;
    company_name?: string;
    email: string;
    role: string;
    is_verified?: boolean;
    cori_verified?: boolean;
    insurance_verified?: boolean;
    created_at: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
    const { user, isAuthenticated, isLoading } = useAuth();
    const router = useRouter();
    const { addNotification } = useNotifications();
    const supabase = createClient();

    // Broadcast
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [broadcastMessage, setBroadcastMessage] = useState("");

    // Manual dispatch mode
    const [manualDispatchMode, setManualDispatchMode] = useState(false);
    const [togglingDispatch, setTogglingDispatch] = useState(false);

    // Dispatch modal
    const [dispatchRequest, setDispatchRequest] = useState<AdminRequest | null>(null);
    const [dispatchOperators, setDispatchOperators] = useState<DispatchOperator[]>([]);
    const [selectedOperatorId, setSelectedOperatorId] = useState("");
    const [sendingDispatch, setSendingDispatch] = useState(false);
    const [dispatchMode, setDispatchMode] = useState<'existing' | 'new'>('existing');
    const [newOpForm, setNewOpForm] = useState({
        company_name: '',
        company_email: '',
        company_phone: '',
        vehicle_types: [] as string[],
        is_partner: false,
    });

    // Data
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [requests, setRequests] = useState<AdminRequest[]>([]);
    const [operators, setOperators] = useState<AdminUser[]>([]);
    const [staff, setStaff] = useState<AdminUser[]>([]);
    const [criticalRequests, setCriticalRequests] = useState<any[]>([]);

    // Loading
    const [loadingStats, setLoadingStats]         = useState(true);
    const [loadingRequests, setLoadingRequests]   = useState(true);
    const [loadingOperators, setLoadingOperators] = useState(true);
    const [loadingStaff, setLoadingStaff]         = useState(true);
    const [loadingCritical, setLoadingCritical]   = useState(true);

    // Search
    const [operatorSearch, setOperatorSearch] = useState("");

    // ── Fetchers ───────────────────────────────────────────────────────────────

    const fetchStats = async () => {
        setLoadingStats(true);
        try {
            const res = await fetch('/api/master/admin/stats');
            if (res.ok) {
                const { stats } = await res.json();
                setStats(stats);
            }
        } catch (e) {
            console.error('fetchStats failed', e);
        } finally {
            setLoadingStats(false);
        }
    };

    const fetchRequests = async () => {
        setLoadingRequests(true);
        try {
            const res = await fetch('/api/master/admin/requests?status=active&limit=50');
            if (res.ok) {
                const { requests } = await res.json();
                setRequests(requests || []);
            }
        } catch (e) {
            console.error('fetchRequests failed', e);
        } finally {
            setLoadingRequests(false);
        }
    };

    const fetchOperators = async (search = "") => {
        setLoadingOperators(true);
        try {
            const params = new URLSearchParams({ role: 'operator', limit: '50' });
            if (search) params.set('search', search);
            const res = await fetch(`/api/master/admin/users?${params}`);
            if (res.ok) {
                const { users } = await res.json();
                setOperators(users || []);
            }
        } catch (e) {
            console.error('fetchOperators failed', e);
        } finally {
            setLoadingOperators(false);
        }
    };

    const fetchStaff = async () => {
        setLoadingStaff(true);
        try {
            const [adminRes, managerRes] = await Promise.all([
                fetch('/api/master/admin/users?role=admin&limit=50'),
                fetch('/api/master/admin/users?role=manager&limit=50'),
            ]);
            const adminData   = adminRes.ok   ? await adminRes.json()   : { users: [] };
            const managerData = managerRes.ok ? await managerRes.json() : { users: [] };
            setStaff([...(adminData.users || []), ...(managerData.users || [])]);
        } catch (e) {
            console.error('fetchStaff failed', e);
        } finally {
            setLoadingStaff(false);
        }
    };

    const fetchDispatchSettings = async () => {
        try {
            const res = await fetch('/api/master/admin/dispatch');
            if (res.ok) {
                const json = await res.json();
                setManualDispatchMode(json.manualDispatchMode);
                setDispatchOperators(json.operators || []);
            }
        } catch (e) {
            console.error('fetchDispatchSettings failed', e);
        }
    };

    const fetchCritical = async () => {
        setLoadingCritical(true);
        try {
            const { data, error } = await supabase
                .from('transport_requests')
                .select('*')
                .eq('metadata_private->requires_manual_allocation', true)
                .order('created_at', { ascending: false });
            if (!error) setCriticalRequests(data || []);
        } catch (e) {
            console.error('fetchCritical failed', e);
        } finally {
            setLoadingCritical(false);
        }
    };

    // ── Effects ────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push("/master/admin/login");
        }
    }, [isLoading, isAuthenticated, router]);

    useEffect(() => {
        if (isAuthenticated && (user?.role === "admin" || user?.role === "manager")) {
            fetchStats();
            fetchRequests();
            fetchOperators();
            fetchStaff();
            fetchCritical();
            fetchDispatchSettings();
        }
    }, [isAuthenticated, user]);

    // Debounced operator search
    useEffect(() => {
        const t = setTimeout(() => fetchOperators(operatorSearch), 300);
        return () => clearTimeout(t);
    }, [operatorSearch]);

    // ── Guards ─────────────────────────────────────────────────────────────────

    if (isLoading) return null;
    if (user?.role !== "admin" && user?.role !== "manager") return notFound();

    // ── Actions ────────────────────────────────────────────────────────────────

    const handleBroadcast = () => {
        if (!broadcastMessage) return;
        addNotification({ title: "Admin Broadcast", message: broadcastMessage, type: "info" });
        setBroadcastMessage("");
        setIsBroadcasting(false);
    };

    const handleForceLeak = async (requestId: string) => {
        try {
            const { error } = await supabase
                .from('transport_requests')
                .update({
                    priority_window_ends_at: new Date().toISOString(),
                    "metadata_private->requires_manual_allocation": false,
                })
                .eq('id', requestId);
            if (error) throw error;
            addNotification({
                title: "Priority Expired",
                message: "Standard network invitation triggered for #" + requestId.substring(0, 8),
                type: "success",
            });
            fetchCritical();
        } catch (e) {
            console.error('handleForceLeak failed', e);
            addNotification({ title: "Action Failed", message: "Could not trigger standard network invitation.", type: "error" });
        }
    };

    const handleToggleDispatchMode = async () => {
        setTogglingDispatch(true);
        try {
            const res = await fetch('/api/master/admin/dispatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'toggle', enabled: !manualDispatchMode }),
            });
            if (res.ok) {
                const json = await res.json();
                setManualDispatchMode(json.manualDispatchMode);
                addNotification({
                    title: json.manualDispatchMode ? "Manual Dispatch ON" : "Auto Matching ON",
                    message: json.manualDispatchMode
                        ? "Auto operator notifications are disabled. You control every dispatch."
                        : "Auto operator matching is now active.",
                    type: "info",
                });
            }
        } catch (e) {
            console.error('toggleDispatchMode failed', e);
        } finally {
            setTogglingDispatch(false);
        }
    };

    const closeDispatchModal = () => {
        setDispatchRequest(null);
        setSelectedOperatorId("");
        setDispatchMode('existing');
        setNewOpForm({ company_name: '', company_email: '', company_phone: '', vehicle_types: [], is_partner: false });
    };

    const handleSendDispatch = async () => {
        if (!dispatchRequest) return;
        setSendingDispatch(true);
        try {
            let body: Record<string, unknown>;
            if (dispatchMode === 'new') {
                if (!newOpForm.company_name || !newOpForm.company_email || !newOpForm.company_phone) {
                    addNotification({ title: "Missing Fields", message: "Name, email, and phone are required", type: "error" });
                    return;
                }
                body = { action: 'create_and_send', requestId: dispatchRequest.id, operator: newOpForm };
            } else {
                if (!selectedOperatorId) return;
                body = { action: 'send', requestId: dispatchRequest.id, operatorId: selectedOperatorId };
            }

            const res = await fetch('/api/master/admin/dispatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (res.ok) {
                const title = dispatchMode === 'new' && json.isNewOperator ? "Operator Created & Notified" : "Email Sent";
                addNotification({ title, message: `Operator notified at ${json.sentTo}`, type: "success" });
                closeDispatchModal();
            } else {
                addNotification({ title: "Send Failed", message: json.error || "Unknown error", type: "error" });
            }
        } catch (e) {
            addNotification({ title: "Send Failed", message: "Network error", type: "error" });
        } finally {
            setSendingDispatch(false);
        }
    };

    // ── Stat cards ─────────────────────────────────────────────────────────────

    const statCards = [
        { label: "Active Requests", value: stats?.activeRequests, icon: MapPin,       color: "text-indigo-600", bg: "bg-indigo-50"  },
        { label: "Operators",       value: stats?.operators,      icon: Bus,           color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: "Users",           value: stats?.users,          icon: Users,         color: "text-blue-600",   bg: "bg-blue-50"    },
        { label: "Total Bookings",  value: stats?.totalBookings,  icon: ActivityIcon,  color: "text-amber-600",  bg: "bg-amber-50"   },
    ];

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const formatTime = (iso: string) =>
        new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // ── Shared sub-components ──────────────────────────────────────────────────

    const TableLoader = () => (
        <div className="flex items-center justify-center py-14">
            <Loader2 className="animate-spin text-neutral-300" size={20} />
        </div>
    );

    const TableEmpty = ({ message }: { message: string }) => (
        <p className="text-sm text-neutral-400 text-center py-12">{message}</p>
    );

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-[#F9FAFB]">
            <Navbar />
            <main className="pt-32 pb-20 container mx-auto max-w-7xl px-6">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-8">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-xs font-semibold">
                                {user?.role === "manager" ? "Manager" : "Admin"}
                            </span>
                            <div className="flex items-center gap-1.5 text-emerald-500 text-xs font-semibold">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Live
                            </div>
                        </div>
                        <h1 className="text-3xl font-semibold text-neutral-900 tracking-tight">Network Overview</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Manual Dispatch Toggle */}
                        <button
                            onClick={handleToggleDispatchMode}
                            disabled={togglingDispatch}
                            className={cn(
                                "flex items-center gap-2 h-9 px-3 rounded border text-xs font-semibold transition-colors",
                                manualDispatchMode
                                    ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
                                    : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                            )}
                        >
                            {togglingDispatch ? (
                                <Loader2 size={13} className="animate-spin" />
                            ) : manualDispatchMode ? (
                                <ToggleRight size={14} />
                            ) : (
                                <ToggleLeft size={14} />
                            )}
                            {manualDispatchMode ? "Manual Dispatch" : "Auto Matching"}
                        </button>

                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={14} />
                            <Input
                                placeholder="Search operators..."
                                value={operatorSearch}
                                onChange={(e) => setOperatorSearch(e.target.value)}
                                className="pl-8 h-9 w-52 rounded border-neutral-200 bg-white text-sm"
                            />
                        </div>
                        <Button
                            onClick={() => setIsBroadcasting(true)}
                            className="h-9 px-4 rounded bg-indigo-600 hover:bg-indigo-700 font-medium gap-2 text-sm"
                        >
                            <Radio size={14} />
                            Broadcast
                        </Button>
                    </div>
                </div>

                {/* Broadcast modal */}
                <AnimatePresence>
                    {isBroadcasting && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                onClick={() => setIsBroadcasting(false)}
                                className="absolute inset-0 bg-black/40"
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                                className="relative w-full max-w-md bg-white rounded-lg p-6 shadow-lg border border-neutral-100"
                            >
                                <h2 className="text-base font-semibold text-neutral-900 mb-1">System Broadcast</h2>
                                <p className="text-sm text-neutral-500 mb-4">Send a global alert to all connected users.</p>
                                <textarea
                                    value={broadcastMessage}
                                    onChange={(e) => setBroadcastMessage(e.target.value)}
                                    placeholder="Type your message..."
                                    className="w-full h-28 rounded border border-neutral-200 bg-white p-3 text-sm text-neutral-900 focus:ring-1 focus:ring-indigo-500 outline-none resize-none mb-4"
                                />
                                <div className="flex gap-2 justify-end">
                                    <Button variant="ghost" className="h-9 rounded" onClick={() => setIsBroadcasting(false)}>Cancel</Button>
                                    <Button className="h-9 rounded bg-indigo-600 font-medium gap-2 text-sm" onClick={handleBroadcast}>
                                        <Send size={14} />
                                        Dispatch
                                    </Button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Dispatch modal */}
                <AnimatePresence>
                    {dispatchRequest && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                onClick={closeDispatchModal}
                                className="absolute inset-0 bg-black/40"
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                                className="relative w-full max-w-md bg-white rounded-lg p-6 shadow-lg border border-neutral-100"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Mail size={15} className="text-amber-600" />
                                    <h2 className="text-base font-semibold text-neutral-900">Dispatch Operator Email</h2>
                                </div>
                                <p className="text-sm text-neutral-500 mb-4">
                                    Send a job notification for request{" "}
                                    <span className="font-mono text-indigo-600">#{dispatchRequest.id.slice(0, 8)}</span>
                                    {" "}({dispatchRequest.service_type}).
                                </p>
                                <div className="bg-neutral-50 rounded p-3 mb-4 text-xs text-neutral-600 space-y-1">
                                    <p><span className="font-medium">Pickup:</span> {dispatchRequest.pickup_address}</p>
                                    <p><span className="font-medium">Dropoff:</span> {dispatchRequest.dropoff_address}</p>
                                </div>

                                {/* Mode tabs */}
                                <div className="flex rounded border border-neutral-200 mb-4 overflow-hidden text-sm">
                                    <button
                                        className={cn("flex-1 py-2 font-medium transition-colors", dispatchMode === 'existing' ? "bg-amber-600 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50")}
                                        onClick={() => setDispatchMode('existing')}
                                    >
                                        Existing Operator
                                    </button>
                                    <button
                                        className={cn("flex-1 py-2 font-medium transition-colors border-l border-neutral-200", dispatchMode === 'new' ? "bg-amber-600 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50")}
                                        onClick={() => setDispatchMode('new')}
                                    >
                                        New Operator
                                    </button>
                                </div>

                                {dispatchMode === 'existing' ? (
                                    <>
                                        <label className="block text-xs font-semibold text-neutral-600 mb-1.5">Select Operator</label>
                                        <select
                                            value={selectedOperatorId}
                                            onChange={(e) => setSelectedOperatorId(e.target.value)}
                                            className="w-full rounded border border-neutral-200 bg-white p-2.5 text-sm text-neutral-900 focus:ring-1 focus:ring-indigo-500 outline-none mb-4"
                                        >
                                            <option value="">— Choose an operator —</option>
                                            {dispatchOperators.map((op) => (
                                                <option key={op.id} value={op.id}>
                                                    {op.company_name}{op.is_partner ? " ★" : ""} — {op.company_email}
                                                </option>
                                            ))}
                                        </select>
                                    </>
                                ) : (
                                    <div className="space-y-3 mb-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-neutral-600 mb-1">Company Name *</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Metro School Transport"
                                                value={newOpForm.company_name}
                                                onChange={(e) => setNewOpForm(f => ({ ...f, company_name: e.target.value }))}
                                                className="w-full rounded border border-neutral-200 bg-white p-2.5 text-sm text-neutral-900 focus:ring-1 focus:ring-amber-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-neutral-600 mb-1">Email *</label>
                                            <input
                                                type="email"
                                                placeholder="operator@company.com"
                                                value={newOpForm.company_email}
                                                onChange={(e) => setNewOpForm(f => ({ ...f, company_email: e.target.value }))}
                                                className="w-full rounded border border-neutral-200 bg-white p-2.5 text-sm text-neutral-900 focus:ring-1 focus:ring-amber-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-neutral-600 mb-1">Phone *</label>
                                            <input
                                                type="tel"
                                                placeholder="(555) 000-0000"
                                                value={newOpForm.company_phone}
                                                onChange={(e) => setNewOpForm(f => ({ ...f, company_phone: e.target.value }))}
                                                className="w-full rounded border border-neutral-200 bg-white p-2.5 text-sm text-neutral-900 focus:ring-1 focus:ring-amber-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-neutral-600 mb-1">Vehicle Types</label>
                                            <div className="flex flex-wrap gap-2">
                                                {['school_bus', 'mini_bus', 'coach', 'van', 'sedan'].map((vt) => (
                                                    <label key={vt} className="flex items-center gap-1.5 text-xs text-neutral-700 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={newOpForm.vehicle_types.includes(vt)}
                                                            onChange={(e) => setNewOpForm(f => ({
                                                                ...f,
                                                                vehicle_types: e.target.checked
                                                                    ? [...f.vehicle_types, vt]
                                                                    : f.vehicle_types.filter(v => v !== vt)
                                                            }))}
                                                            className="rounded"
                                                        />
                                                        {vt.replace('_', ' ')}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={newOpForm.is_partner}
                                                onChange={(e) => setNewOpForm(f => ({ ...f, is_partner: e.target.checked }))}
                                                className="rounded"
                                            />
                                            <span className="font-medium">Mark as partner operator ★</span>
                                        </label>
                                    </div>
                                )}

                                <div className="flex gap-2 justify-end">
                                    <Button
                                        variant="ghost"
                                        className="h-9 rounded"
                                        onClick={closeDispatchModal}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        className="h-9 rounded bg-amber-600 hover:bg-amber-700 font-medium gap-2 text-sm"
                                        disabled={sendingDispatch || (dispatchMode === 'existing' ? !selectedOperatorId : !newOpForm.company_name || !newOpForm.company_email || !newOpForm.company_phone)}
                                        onClick={handleSendDispatch}
                                    >
                                        {sendingDispatch ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                                        {dispatchMode === 'new' ? 'Create & Dispatch' : 'Send Email'}
                                    </Button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Stat cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {statCards.map((stat) => (
                        <Card key={stat.label} className="border-none shadow-sm bg-white rounded-lg">
                            <CardContent className="p-5">
                                <div className={cn("inline-flex p-2 rounded mb-3", stat.bg, stat.color)}>
                                    <stat.icon size={16} />
                                </div>
                                <div className="text-2xl font-semibold text-neutral-900 tabular-nums">
                                    {loadingStats
                                        ? <Loader2 size={16} className="animate-spin text-neutral-300 mt-1" />
                                        : (stat.value ?? '—').toLocaleString()
                                    }
                                </div>
                                <p className="text-xs text-neutral-500 mt-1">{stat.label}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Tabs */}
                <Tabs defaultValue="live-requests" className="space-y-5">
                    <TabsList className="bg-white border border-neutral-100 p-1 h-auto rounded">
                        <TabsTrigger value="live-requests" className="px-5 h-9 rounded font-medium text-sm">
                            Live Requests
                        </TabsTrigger>
                        <TabsTrigger value="safety-valve" className="px-5 h-9 rounded font-medium text-sm relative">
                            Safety Valve
                            {criticalRequests.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full">
                                    {criticalRequests.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="operators" className="px-5 h-9 rounded font-medium text-sm">
                            Operators
                        </TabsTrigger>
                        <TabsTrigger value="team" className="px-5 h-9 rounded font-medium text-sm">
                            Staff
                        </TabsTrigger>
                    </TabsList>

                    {/* ── Live Requests ─────────────────────────────────────── */}
                    <TabsContent value="live-requests">
                        <Card className="border-none shadow-sm bg-white rounded-lg overflow-hidden">
                            <CardHeader className="p-5 pb-4 border-b border-neutral-50">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-base font-semibold">Active Requests</CardTitle>
                                        <CardDescription className="text-sm mt-0.5">Real-time ride requests across the network.</CardDescription>
                                    </div>
                                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded">
                                        {requests.length} live
                                    </span>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {loadingRequests ? <TableLoader /> : requests.length === 0 ? <TableEmpty message="No active requests." /> : (
                                    <ScrollArea className="h-[400px]">
                                        <div className="px-6">
                                            <table className="w-full">
                                                <thead className="sticky top-0 bg-white z-10 border-b border-neutral-100">
                                                    <tr className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
                                                        <th className="text-left py-3">ID</th>
                                                        <th className="text-left py-3">User</th>
                                                        <th className="text-left py-3">Route</th>
                                                        <th className="text-left py-3">Status</th>
                                                        <th className="text-left py-3">Quotes</th>
                                                        <th className="text-right py-3">Date</th>
                                                        <th className="w-24"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-neutral-50">
                                                    {requests.map((req) => (
                                                        <tr key={req.id} className="hover:bg-neutral-50/60 transition-colors">
                                                            <td className="py-3.5">
                                                                <span className="text-xs font-mono text-indigo-600">#{req.id.slice(0, 8)}</span>
                                                            </td>
                                                            <td className="py-3.5">
                                                                <span className="text-sm font-medium text-neutral-900">{req.user?.full_name || '—'}</span>
                                                                <p className="text-[11px] text-neutral-400 capitalize">{req.service_type}</p>
                                                            </td>
                                                            <td className="py-3.5 max-w-[200px]">
                                                                <p className="text-xs text-neutral-600 truncate">{req.pickup_address}</p>
                                                                <p className="text-xs text-neutral-400 truncate">{req.dropoff_address}</p>
                                                            </td>
                                                            <td className="py-3.5">
                                                                <span className={cn(
                                                                    "text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize",
                                                                    req.status === 'pending' && "bg-amber-100 text-amber-700",
                                                                    req.status === 'quoted'  && "bg-indigo-100 text-indigo-700",
                                                                    req.status === 'matched' && "bg-sky-100 text-sky-700",
                                                                )}>
                                                                    {req.status}
                                                                </span>
                                                            </td>
                                                            <td className="py-3.5">
                                                                <span className="text-sm font-medium text-neutral-700">
                                                                    {req.quotes?.[0]?.count ?? 0}
                                                                </span>
                                                            </td>
                                                            <td className="py-3.5 text-right">
                                                                <span className="text-xs text-neutral-400">{formatDate(req.created_at)}</span>
                                                            </td>
                                                            <td className="py-3.5 text-right">
                                                                <Button
                                                                    variant="outline"
                                                                    className="h-7 text-xs border-amber-200 text-amber-700 hover:bg-amber-50 gap-1"
                                                                    onClick={() => { setDispatchRequest(req); setSelectedOperatorId(""); }}
                                                                >
                                                                    <Mail size={11} />
                                                                    Dispatch
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </ScrollArea>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ── Safety Valve ──────────────────────────────────────── */}
                    <TabsContent value="safety-valve">
                        <Card className="border-none shadow-sm bg-white rounded-lg overflow-hidden">
                            <CardHeader className="p-5 pb-4 border-b border-neutral-50">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-red-50 text-red-600 rounded">
                                            <AlertTriangle size={15} />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base font-semibold text-red-900">Manual Allocation Queue</CardTitle>
                                            <CardDescription className="text-sm mt-0.5">High-priority rides requiring human intervention.</CardDescription>
                                        </div>
                                    </div>
                                    <span className="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded">
                                        {criticalRequests.length} alerts
                                    </span>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {loadingCritical ? <TableLoader /> : criticalRequests.length === 0 ? (
                                    <div className="flex flex-col items-center py-14 text-center">
                                        <Shield className="text-neutral-200 mb-3" size={24} />
                                        <p className="text-sm font-medium text-neutral-500">All clear</p>
                                        <p className="text-xs text-neutral-400 mt-1">No requests require manual intervention.</p>
                                    </div>
                                ) : (
                                    <ScrollArea className="h-[450px]">
                                        <div className="px-6 pb-6">
                                            <table className="w-full">
                                                <thead className="sticky top-0 bg-white z-10 border-b border-neutral-100">
                                                    <tr className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
                                                        <th className="text-left py-3">Request</th>
                                                        <th className="text-left py-3">Type</th>
                                                        <th className="text-left py-3">Wait Since</th>
                                                        <th className="text-right py-3">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-neutral-50">
                                                    {criticalRequests.map((req) => (
                                                        <tr key={req.id} className="hover:bg-red-50/20 transition-colors">
                                                            <td className="py-4">
                                                                <span className="text-sm font-semibold text-neutral-900">#{req.id.substring(0, 8)}</span>
                                                                <p className="text-xs text-neutral-500 mt-0.5">{req.pickup_fuzzy}</p>
                                                            </td>
                                                            <td className="py-4">
                                                                <span className="text-xs font-medium text-neutral-600 capitalize">{req.service_type}</span>
                                                                {req.metadata_safe?.mobility_level && (
                                                                    <p className="text-[11px] text-neutral-400 mt-0.5">{req.metadata_safe.mobility_level}</p>
                                                                )}
                                                            </td>
                                                            <td className="py-4">
                                                                <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                                                                    <Clock size={12} />
                                                                    {formatTime(req.created_at)}
                                                                </div>
                                                            </td>
                                                            <td className="py-4 text-right">
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <Button
                                                                        variant="outline"
                                                                        className="h-7 text-xs border-neutral-200"
                                                                        onClick={() => handleForceLeak(req.id)}
                                                                    >
                                                                        Invite Standard
                                                                    </Button>
                                                                    <Button className="h-7 text-xs bg-neutral-900">
                                                                        Manual Match
                                                                    </Button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </ScrollArea>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ── Operators ─────────────────────────────────────────── */}
                    <TabsContent value="operators">
                        <Card className="border-none shadow-sm bg-white rounded-lg overflow-hidden">
                            <CardHeader className="p-5 pb-4 border-b border-neutral-50">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-base font-semibold">Registered Operators</CardTitle>
                                        <CardDescription className="text-sm mt-0.5">Fleet partners on the network.</CardDescription>
                                    </div>
                                    <span className="text-xs font-semibold text-neutral-500">{operators.length} total</span>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {loadingOperators ? <TableLoader /> : operators.length === 0 ? <TableEmpty message="No operators found." /> : (
                                    <ScrollArea className="h-[400px]">
                                        <div className="px-6">
                                            <table className="w-full">
                                                <thead className="sticky top-0 bg-white z-10 border-b border-neutral-100">
                                                    <tr className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
                                                        <th className="text-left py-3">Operator</th>
                                                        <th className="text-left py-3">Email</th>
                                                        <th className="text-left py-3">Status</th>
                                                        <th className="text-right py-3">Joined</th>
                                                        <th className="w-8"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-neutral-50">
                                                    {operators.map((op) => (
                                                        <tr key={op.id} className="group hover:bg-neutral-50/60 transition-colors">
                                                            <td className="py-3.5">
                                                                <span className="text-sm font-semibold text-neutral-900">{op.company_name || op.full_name}</span>
                                                                {op.company_name && op.full_name && (
                                                                    <p className="text-[11px] text-neutral-400">{op.full_name}</p>
                                                                )}
                                                            </td>
                                                            <td className="py-3.5">
                                                                <span className="text-xs text-neutral-500">{op.email}</span>
                                                            </td>
                                                            <td className="py-3.5">
                                                                <div className="flex gap-1 flex-wrap">
                                                                    {op.is_verified && <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Active</span>}
                                                                    {op.cori_verified && <span className="text-[10px] font-semibold text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded">CORI</span>}
                                                                    {op.insurance_verified && <span className="text-[10px] font-semibold text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded">Insured</span>}
                                                                    {!op.is_verified && !op.cori_verified && !op.insurance_verified && <span className="text-[10px] text-neutral-400">—</span>}
                                                                </div>
                                                            </td>
                                                            <td className="py-3.5 text-right">
                                                                <span className="text-xs text-neutral-400">{formatDate(op.created_at)}</span>
                                                            </td>
                                                            <td className="py-3.5 text-right pr-1">
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded text-neutral-300 hover:text-neutral-900 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <MoreVertical size={14} />
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </ScrollArea>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ── Staff ─────────────────────────────────────────────── */}
                    <TabsContent value="team">
                        <Card className="border-none shadow-sm bg-white rounded-lg overflow-hidden">
                            <CardHeader className="p-5 pb-4 border-b border-neutral-50">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-base font-semibold">Internal Staff</CardTitle>
                                        <CardDescription className="text-sm mt-0.5">Admins and managers on the platform.</CardDescription>
                                    </div>
                                    <span className="text-xs font-semibold text-neutral-500">{staff.length} members</span>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {loadingStaff ? <TableLoader /> : staff.length === 0 ? <TableEmpty message="No staff members found." /> : (
                                    <ScrollArea className="h-[400px]">
                                        <div className="px-6">
                                            <table className="w-full">
                                                <thead className="sticky top-0 bg-white z-10 border-b border-neutral-100">
                                                    <tr className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
                                                        <th className="text-left py-3">Name</th>
                                                        <th className="text-left py-3">Email</th>
                                                        <th className="text-left py-3">Role</th>
                                                        <th className="text-right py-3">Joined</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-neutral-50">
                                                    {staff.map((member) => (
                                                        <tr key={member.id} className="hover:bg-neutral-50/60 transition-colors">
                                                            <td className="py-3.5">
                                                                <span className="text-sm font-semibold text-neutral-900">{member.full_name || '—'}</span>
                                                            </td>
                                                            <td className="py-3.5">
                                                                <span className="text-xs text-neutral-500">{member.email}</span>
                                                            </td>
                                                            <td className="py-3.5">
                                                                <span className={cn(
                                                                    "text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize",
                                                                    member.role === 'admin' ? "bg-indigo-50 text-indigo-600" : "bg-neutral-100 text-neutral-600"
                                                                )}>
                                                                    {member.role}
                                                                </span>
                                                            </td>
                                                            <td className="py-3.5 text-right">
                                                                <span className="text-xs text-neutral-400">{formatDate(member.created_at)}</span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </ScrollArea>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}
