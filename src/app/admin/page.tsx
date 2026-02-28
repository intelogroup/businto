"use client";

import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { Navbar } from "@/components/navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Users,
    MapPin,
    Bus,
    Activity as ActivityIcon,
    ArrowUpRight,
    Shield,
    Search,
    MoreVertical,
    Radio,
    Send,
    UserPlus,
    AlertCircle,
    Bell,
    ExternalLink,
    Clock,
    UserCheck,
    AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MOCK_LIVE_REQUESTS = [
    { id: "REQ-1", user: "Sarah Jones", type: "School Run", from: "Cambridge", to: "Brookline", status: "Live", time: "2 min ago", budget: "$85" },
    { id: "REQ-2", user: "David Miller", type: "Airport", from: "Back Bay", to: "Logan Airport", status: "Matching", time: "5 min ago", budget: "$120" },
    { id: "REQ-3", user: "Michael Chen", type: "Event", from: "Downtown", to: "Foxborough", status: "Live", time: "8 min ago", budget: "$450" },
    { id: "REQ-4", user: "Emma Wilson", type: "NEMT", from: "Somerville", to: "MGH", status: "Quoted", time: "12 min ago", budget: "$65" },
];

const MOCK_OPERATORS = [
    { id: "OP-1", name: "Boston Coach", fleet: 45, status: "Active", reliability: "98%", revenue: "$12.4k" },
    { id: "OP-2", name: "Swift Shuttles", fleet: 12, status: "Idle", reliability: "95%", revenue: "$4.1k" },
    { id: "OP-3", name: "Alpha Transit", fleet: 28, status: "Active", reliability: "99%", revenue: "$18.2k" },
    { id: "OP-4", name: "City Link", fleet: 15, status: "Maintenance", reliability: "92%", revenue: "$2.8k" },
];

const MOCK_SYSTEM_LOGS = [
    { time: "12:45:02", event: "New Operator Registered", details: "Swift Shuttles LLC joined the network", type: "info" },
    { time: "12:44:15", event: "High Traffic Alert", details: "Above average requests in Boston Seaport area", type: "warning" },
    { time: "12:42:30", event: "Quote Accepted", details: "REQ-452 accepted by Boston Coach", type: "success" },
    { time: "12:40:11", event: "System Backup", details: "Automated database backup completed", type: "info" },
];

const MOCK_MANAGERS = [
    { id: "MGR-1", name: "Marcus Grant", email: "marcus@businto.com", role: "Team Lead", status: "Online", performance: "94%" },
    { id: "MGR-2", name: "Elena Rodriguez", email: "elena@businto.com", role: "Dispatcher", status: "Away", performance: "88%" },
    { id: "MGR-3", name: "Sam Wilson", email: "sam@businto.com", role: "Operations", status: "Online", performance: "99%" },
];

export default function AdminDashboard() {
    const { user, isAuthenticated, isLoading } = useAuth();
    const router = useRouter();
    const { addNotification } = useNotifications();
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [broadcastMessage, setBroadcastMessage] = useState("");
    const [criticalRequests, setCriticalRequests] = useState<any[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const supabase = createClient();

    const fetchCriticalRequests = async () => {
        setIsLoadingData(true);
        try {
            // Fetch requests where requires_manual_allocation is true in metadata_private
            // Supabase JSONB filtering: data->>field = 'value'
            const { data, error } = await supabase
                .from('transport_requests')
                .select('*')
                .eq('metadata_private->requires_manual_allocation', true)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setCriticalRequests(data || []);
        } catch (err) {
            console.error('Failed to fetch critical requests:', err);
        } finally {
            setIsLoadingData(false);
        }
    };

    useEffect(() => {
        if (isAuthenticated && (user?.role === "admin" || user?.role === "manager")) {
            fetchCriticalRequests();
        }
    }, [isAuthenticated, user]);

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push("/admin/login");
        }
    }, [isLoading, isAuthenticated, router]);

    if (isLoading) return null;

    const handleBroadcast = () => {
        if (!broadcastMessage) return;
        addNotification({
            title: "Admin Broadcast",
            message: broadcastMessage,
            type: "info"
        });
        setBroadcastMessage("");
        setIsBroadcasting(false);
    };

    const handleForceLeak = async (requestId: string) => {
        try {
            // Set priority window to now (expire it) and notify standard network
            // In a real scenario, this might call a server action or API route.
            // For now, we update the DB and the cron will pick it up, or we could trigger the leak logic.
            const { error } = await supabase
                .from('transport_requests')
                .update({
                    priority_window_ends_at: new Date().toISOString(),
                    // Optionally clear the manual allocation flag if this "handles" it
                    "metadata_private->requires_manual_allocation": false
                })
                .eq('id', requestId);

            if (error) throw error;

            addNotification({
                title: "Priority Expired",
                message: "Standard network invitation triggered for #" + requestId.substring(0, 8),
                type: "success"
            });

            // Refresh the list
            fetchCriticalRequests();
        } catch (err) {
            console.error('Failed to force leak:', err);
            addNotification({
                title: "Action Failed",
                message: "Could not trigger standard network invitation.",
                type: "error"
            });
        }
    };

    const stats = [
        { label: "Active Requests", value: "24", icon: MapPin, color: "text-indigo-600", bg: "bg-indigo-50", trend: "+12%" },
        { label: "Total Operators", value: "142", icon: Bus, color: "text-emerald-600", bg: "bg-emerald-50", trend: "+4%" },
        { label: "Total Users", value: "1,284", icon: Users, color: "text-blue-600", bg: "bg-blue-50", trend: "+18%" },
        { label: "System Health", value: "99.9%", icon: ActivityIcon, color: "text-amber-600", bg: "bg-amber-50", trend: "Stable" },
    ];

    if (user?.role !== "admin" && user?.role !== "manager") {
        return (
            <div className="min-h-screen bg-[#F9FAFB] flex flex-col">
                <Navbar />
                <main className="flex-1 flex items-center justify-center p-6">
                    <Card className="max-w-md w-full border-none shadow-lg p-10 rounded-lg text-center">
                        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Shield className="text-red-500" size={32} />
                        </div>
                        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">Access Denied</h1>
                        <p className="text-neutral-500 font-medium mb-8">This page is restricted to administrators and managers only.</p>
                        <Button asChild className="w-full h-10 rounded-md bg-neutral-900 font-semibold">
                            <a href="/dashboard">Return to Dashboard</a>
                        </Button>
                    </Card>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F9FAFB]">
            <Navbar />
            <main className="pt-32 pb-20 container mx-auto max-w-7xl px-8 md:px-12 lg:px-16">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                    <div>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-md text-xs font-semibold">
                                {user?.role === "manager" ? "Manager Control Panel" : "Admin Control Panel"}
                            </div>
                            <div className="flex items-center gap-1.5 text-emerald-500 text-xs font-semibold">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                System Live
                            </div>
                        </div>
                        <h1 className="text-5xl font-semibold text-neutral-900 tracking-tight">Network Overview</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                            <Input placeholder="Search logs, IDs, users..." className="pl-11 h-10 w-64 rounded-md border-neutral-200 bg-white" />
                        </div>
                        <Button
                            onClick={() => setIsBroadcasting(true)}
                            className="h-10 px-6 rounded-md bg-indigo-600 hover:bg-indigo-700 font-semibold gap-2 shadow-sm transition-colors duration-150"
                        >
                            <Radio size={18} />
                            Broadcast Alert
                        </Button>
                        <Button className="h-10 px-6 rounded-md bg-neutral-900 font-semibold gap-2 transition-colors duration-150">
                            <Shield size={18} />
                            Audit System
                        </Button>
                    </div>
                </div>

                {/* Broadcast Modal Overlay */}
                <AnimatePresence>
                    {isBroadcasting && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsBroadcasting(false)}
                                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                className="relative w-full max-w-lg bg-white rounded-lg p-8 shadow-lg border border-neutral-100"
                            >
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-md">
                                        <Radio size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-semibold text-neutral-900 leading-tight">System Broadcast</h2>
                                        <p className="text-sm text-neutral-500 font-medium">Send a global alert to all connected users.</p>
                                    </div>
                                </div>
                                <textarea
                                    value={broadcastMessage}
                                    onChange={(e) => setBroadcastMessage(e.target.value)}
                                    placeholder="Type your message here..."
                                    className="w-full h-32 rounded-md border-neutral-200 bg-white p-4 font-medium text-neutral-900 focus:ring-2 focus:ring-indigo-500 outline-none resize-none mb-6"
                                />
                                <div className="flex gap-3">
                                    <Button variant="ghost" className="flex-1 h-10 rounded-md" onClick={() => setIsBroadcasting(false)}>
                                        Cancel
                                    </Button>
                                    <Button className="flex-1 h-10 rounded-md bg-indigo-600 font-semibold gap-2 transition-colors duration-150" onClick={handleBroadcast}>
                                        <Send size={18} />
                                        Dispatch
                                    </Button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                    {stats.map((stat, i) => (
                        <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                        >
                            <Card className="border-none shadow-sm bg-white overflow-hidden rounded-lg">
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className={`p-3 rounded-md ${stat.bg} ${stat.color}`}>
                                            <stat.icon size={22} />
                                        </div>
                                        <div className="flex items-center gap-1 text-xs font-semibold text-neutral-400">
                                            {stat.trend.includes('+') ? <ArrowUpRight size={14} className="text-emerald-500" /> : null}
                                            <span className={stat.trend.includes('+') ? "text-emerald-500" : ""}>{stat.trend}</span>
                                        </div>
                                    </div>
                                    <h3 className="text-neutral-500 text-sm font-semibold mb-1">{stat.label}</h3>
                                    <div className="text-3xl font-semibold text-neutral-900">{stat.value}</div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>

                {/* Tabs Content */}
                <Tabs defaultValue="live-requests" className="space-y-6">
                    <TabsList className="bg-white border border-neutral-100 p-1.5 h-auto rounded-md">
                        <TabsTrigger value="live-requests" className="px-8 h-10 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm font-semibold text-sm text-neutral-500 data-[state=active]:text-black transition-colors duration-150">
                            Live Requests
                        </TabsTrigger>
                        <TabsTrigger value="safety-valve" className="px-8 h-10 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm font-semibold text-sm text-neutral-500 data-[state=active]:text-black transition-colors duration-150 relative">
                            Safety Valve
                            {criticalRequests.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full animate-pulse">
                                    {criticalRequests.length}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="users" className="px-8 h-10 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm font-semibold text-sm text-neutral-500 data-[state=active]:text-black transition-colors duration-150">
                            Operators
                        </TabsTrigger>
                        <TabsTrigger value="team" className="px-8 h-10 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm font-semibold text-sm text-neutral-500 data-[state=active]:text-black transition-colors duration-150">
                            Staff Team
                        </TabsTrigger>
                        {user?.role === "admin" && (
                            <TabsTrigger value="system-logs" className="px-8 h-10 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm font-semibold text-sm text-neutral-500 data-[state=active]:text-black transition-colors duration-150">
                                System Logs
                            </TabsTrigger>
                        )}
                    </TabsList>

                    <TabsContent value="live-requests">
                        <Card className="border-none shadow-sm bg-white overflow-hidden rounded-lg">
                            <CardHeader className="p-6 pb-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-xl font-semibold">Active Network Traffic</CardTitle>
                                        <CardDescription className="text-neutral-500 font-medium mt-1">Real-time monitoring of ride requests globally.</CardDescription>
                                    </div>
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-none font-semibold text-xs px-3 py-1">
                                        {MOCK_LIVE_REQUESTS.length} LIVE NOW
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="h-[400px]">
                                    <div className="px-8">
                                        <table className="w-full">
                                            <thead className="sticky top-0 bg-white z-10 border-b border-neutral-100">
                                                <tr className="text-xs font-semibold text-neutral-400">
                                                    <th className="text-left py-4">Request ID</th>
                                                    <th className="text-left py-4">User</th>
                                                    <th className="text-left py-4">Route</th>
                                                    <th className="text-left py-4">Status</th>
                                                    <th className="text-left py-4">Time</th>
                                                    <th className="text-right py-4">Budget</th>
                                                    <th className="w-10"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-neutral-50">
                                                {MOCK_LIVE_REQUESTS.map((req) => (
                                                    <tr key={req.id} className="group hover:bg-neutral-50/50 transition-colors duration-150">
                                                        <td className="py-4">
                                                            <span className="text-sm font-semibold text-indigo-600">{req.id}</span>
                                                        </td>
                                                        <td className="py-4">
                                                            <span className="text-sm font-semibold text-neutral-900">{req.user}</span>
                                                            <p className="text-xs text-neutral-400 font-medium mt-0.5">{req.type}</p>
                                                        </td>
                                                        <td className="py-4">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium text-neutral-600">{req.from}</span>
                                                                <div className="w-4 h-px bg-neutral-200" />
                                                                <span className="text-sm font-medium text-neutral-600">{req.to}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-4">
                                                            <Badge className={cn(
                                                                "border-none font-semibold text-xs px-2 py-0.5",
                                                                req.status === "Live" ? "bg-amber-100 text-amber-600" :
                                                                    req.status === "Matching" ? "bg-indigo-100 text-indigo-600" :
                                                                        "bg-emerald-100 text-emerald-600"
                                                            )}>
                                                                {req.status}
                                                            </Badge>
                                                        </td>
                                                        <td className="py-4">
                                                            <span className="text-xs font-semibold text-neutral-500">{req.time}</span>
                                                        </td>
                                                        <td className="py-4 text-right">
                                                            <span className="text-sm font-semibold text-neutral-900">{req.budget}</span>
                                                        </td>
                                                        <td className="py-4 text-right pr-4">
                                                            <Button variant="ghost" size="icon" className="text-neutral-400 hover:text-black hover:bg-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                                                <MoreVertical size={16} />
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="safety-valve">
                        <Card className="border-none shadow-sm bg-white overflow-hidden rounded-lg">
                            <CardHeader className="p-6 pb-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-red-50 text-red-600 rounded-md">
                                            <AlertTriangle size={20} />
                                        </div>
                                        <div>
                                            <CardTitle className="text-xl font-semibold text-red-900">Manual Allocation Queue</CardTitle>
                                            <CardDescription className="text-neutral-500 font-medium mt-1">High-priority specialized rides requiring human intervention.</CardDescription>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="bg-red-50 text-red-600 border-red-100 font-semibold text-xs px-3 py-1">
                                        {criticalRequests.length} ALERTS
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="h-[450px]">
                                    <div className="px-8 pb-8">
                                        {criticalRequests.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                                <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mb-4">
                                                    <Shield className="text-neutral-300" size={32} />
                                                </div>
                                                <h3 className="text-lg font-semibold text-neutral-900">All Clear</h3>
                                                <p className="text-neutral-500 max-w-xs mx-auto">No requests currently require manual intervention. Everything is flowing automatedly.</p>
                                            </div>
                                        ) : (
                                            <table className="w-full">
                                                <thead className="sticky top-0 bg-white z-10 border-b border-neutral-100">
                                                    <tr className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                                                        <th className="text-left py-4">Request</th>
                                                        <th className="text-left py-4">Specialization</th>
                                                        <th className="text-left py-4">Reason</th>
                                                        <th className="text-left py-4">Wait Time</th>
                                                        <th className="text-right py-4 px-4">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-neutral-50">
                                                    {criticalRequests.map((req) => (
                                                        <tr key={req.id} className="group hover:bg-red-50/30 transition-colors">
                                                            <td className="py-6">
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-bold text-neutral-900">#{req.id.substring(0, 8)}</span>
                                                                    <span className="text-xs text-neutral-500">{req.service_type} · {req.pickup_fuzzy}</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-6">
                                                                <div className="flex flex-wrap gap-1">
                                                                    {req.metadata_safe?.mobility_level && (
                                                                        <Badge variant="outline" className="text-[10px] uppercase font-bold bg-neutral-50 border-neutral-200">
                                                                            {req.metadata_safe.mobility_level}
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="py-6">
                                                                <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded">No Auto-Matches</span>
                                                            </td>
                                                            <td className="py-6">
                                                                <div className="flex items-center gap-1.5 text-xs text-neutral-500 font-semibold">
                                                                    <Clock size={14} />
                                                                    {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </div>
                                                            </td>
                                                            <td className="py-6 text-right">
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <Button
                                                                        variant="outline"
                                                                        className="h-8 text-xs font-bold border-neutral-200 hover:bg-neutral-50"
                                                                        onClick={() => handleForceLeak(req.id)}
                                                                    >
                                                                        Invite Standard
                                                                    </Button>
                                                                    <Button
                                                                        className="h-8 text-xs font-bold bg-neutral-900"
                                                                        onClick={() => {
                                                                            // Logic to view operators
                                                                        }}
                                                                    >
                                                                        Manual Match
                                                                    </Button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="users">
                        <Card className="border-none shadow-sm bg-white overflow-hidden rounded-lg">
                            <CardHeader className="p-6 pb-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-xl font-semibold">Registered Operators</CardTitle>
                                        <CardDescription className="text-neutral-500 font-medium mt-1">Management and auditing of fleet partners.</CardDescription>
                                    </div>
                                    <Button className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-none font-semibold text-xs px-4 h-10 rounded-md gap-2 transition-colors duration-150">
                                        <UserPlus size={14} />
                                        Add Partner
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="h-[400px]">
                                    <div className="px-8">
                                        <table className="w-full">
                                            <thead className="sticky top-0 bg-white z-10 border-b border-neutral-100">
                                                <tr className="text-[11px] font-black uppercase tracking-widest text-neutral-400">
                                                    <th className="text-left py-5">Operator</th>
                                                    <th className="text-left py-5">Fleet Size</th>
                                                    <th className="text-left py-5">Status</th>
                                                    <th className="text-left py-5">Reliability</th>
                                                    <th className="text-right py-5">Rev. (30d)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-neutral-50">
                                                {MOCK_OPERATORS.map((op) => (
                                                    <tr key={op.id} className="group hover:bg-neutral-50/50 transition-colors">
                                                        <td className="py-6 text-sm font-bold text-neutral-900">{op.name}</td>
                                                        <td className="py-6 text-sm font-semibold text-neutral-500">{op.fleet} Vehicles</td>
                                                        <td className="py-6">
                                                            <Badge className={cn(
                                                                "border-none font-black uppercase text-[10px] px-2 py-0.5 tracking-wider",
                                                                op.status === "Active" ? "bg-emerald-100 text-emerald-600" :
                                                                    op.status === "Idle" ? "bg-neutral-100 text-neutral-600" :
                                                                        "bg-red-100 text-red-600"
                                                            )}>
                                                                {op.status}
                                                            </Badge>
                                                        </td>
                                                        <td className="py-6">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-16 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-emerald-500"
                                                                        style={{ width: op.reliability }}
                                                                    />
                                                                </div>
                                                                <span className="text-[11px] font-black text-neutral-900">{op.reliability}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-6 text-right font-black text-neutral-900">{op.revenue}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="team">
                        <Card className="border-none shadow-sm bg-white overflow-hidden rounded-lg">
                            <CardHeader className="p-6 pb-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-xl font-semibold">Businto internal Team</CardTitle>
                                        <CardDescription className="text-neutral-500 font-medium mt-1">Management of internal platform managers and dispatchers.</CardDescription>
                                    </div>
                                    <Button className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-none font-semibold text-xs px-4 h-10 rounded-md gap-2 transition-colors duration-150">
                                        <UserPlus size={14} />
                                        Add Manager
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="h-[400px]">
                                    <div className="px-8">
                                        <table className="w-full">
                                            <thead className="sticky top-0 bg-white z-10 border-b border-neutral-100">
                                                <tr className="text-[11px] font-black uppercase tracking-widest text-neutral-400">
                                                    <th className="text-left py-5">Manager</th>
                                                    <th className="text-left py-5">Role</th>
                                                    <th className="text-left py-5">Status</th>
                                                    <th className="text-left py-5">Performance</th>
                                                    <th className="w-10"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-neutral-50">
                                                {MOCK_MANAGERS.map((mgr) => (
                                                    <tr key={mgr.id} className="group hover:bg-neutral-50/50 transition-colors">
                                                        <td className="py-6">
                                                            <span className="text-sm font-bold text-neutral-900">{mgr.name}</span>
                                                            <p className="text-[11px] text-neutral-400 font-medium">{mgr.email}</p>
                                                        </td>
                                                        <td className="py-6">
                                                            <Badge variant="outline" className="border-neutral-200 text-neutral-600 font-bold text-[10px] uppercase tracking-wider">
                                                                {mgr.role}
                                                            </Badge>
                                                        </td>
                                                        <td className="py-6">
                                                            <div className="flex items-center gap-1.5">
                                                                <div className={cn(
                                                                    "w-1.5 h-1.5 rounded-full",
                                                                    mgr.status === "Online" ? "bg-emerald-500" : "bg-neutral-300"
                                                                )} />
                                                                <span className="text-xs font-bold text-neutral-600">{mgr.status}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-6">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-16 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-indigo-500"
                                                                        style={{ width: mgr.performance }}
                                                                    />
                                                                </div>
                                                                <span className="text-[11px] font-black text-neutral-900">{mgr.performance}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-6 text-right pr-4">
                                                            <Button variant="ghost" size="icon" className="text-neutral-400 hover:text-black rounded-lg opacity-0 group-hover:opacity-100">
                                                                <MoreVertical size={16} />
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {user?.role === "admin" && (
                        <TabsContent value="system-logs">
                            <Card className="border-none shadow-sm bg-neutral-900 overflow-hidden rounded-lg">
                                <CardHeader className="p-6 border-b border-white/10">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-xl font-semibold text-white">Console Logs</CardTitle>
                                            <CardDescription className="text-neutral-400 font-medium mt-1">Raw system throughput and events.</CardDescription>
                                        </div>
                                        <Button variant="ghost" size="sm" className="text-neutral-400 hover:text-white text-xs font-semibold px-3 py-1 transition-colors duration-150">
                                            Export Logs
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <ScrollArea className="h-[400px] bg-neutral-950/50">
                                        <div className="p-8 font-mono text-xs">
                                            {MOCK_SYSTEM_LOGS.map((log, i) => (
                                                <div key={i} className="flex gap-4 mb-4 group">
                                                    <span className="text-neutral-600 font-semibold tracking-tight">{log.time}</span>
                                                    <div className="flex-1">
                                                        <span className={cn(
                                                            "font-semibold mr-3",
                                                            log.type === "info" ? "text-blue-400" :
                                                                log.type === "warning" ? "text-amber-400" : "text-emerald-400"
                                                        )}>[{log.type}]</span>
                                                        <span className="text-white/90 font-semibold">{log.event}</span>
                                                        <span className="text-neutral-500 ml-3">{log.details}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    )}
                </Tabs>
            </main>
        </div>
    );
}

function cn(...inputs: (string | boolean | undefined | null)[]) {
    return inputs.filter(Boolean).join(" ");
}
