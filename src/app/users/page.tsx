"use client";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Plus,
    Search,
    MoreHorizontal,
    Shield,
    Users,
    Activity,
    CheckCircle2,
    ArrowLeft
} from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/navbar";

const TEAM_MEMBERS = [
    {
        id: "1",
        name: "Alex Thompson",
        email: "alex@example.com",
        role: "Admin",
        status: "Active",
        lastActive: "2 mins ago",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex",
    },
    {
        id: "2",
        name: "Sarah Miller",
        email: "sarah@operator.com",
        role: "Operator",
        status: "Active",
        lastActive: "1 hour ago",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
    },
    {
        id: "3",
        name: "Michael Chen",
        email: "michael@dispatch.com",
        role: "Dispatcher",
        status: "Offline",
        lastActive: "5 hours ago",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Michael",
    },
    {
        id: "4",
        name: "Elena Rodriguez",
        email: "elena@support.com",
        role: "Support",
        status: "Active",
        lastActive: "Just now",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Elena",
    },
];

export default function UsersPage() {
    const { user } = useAuth();

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
                        <Button asChild className="w-full h-10 rounded-md bg-neutral-900 font-semibold transition-colors duration-150">
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
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                    <div className="space-y-2">
                        <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-400 hover:text-black transition-colors duration-150 mb-4">
                            <ArrowLeft size={14} />
                            Back to Dashboard
                        </Link>
                        <h1 className="text-4xl font-semibold text-neutral-900 tracking-tight">Team Management</h1>
                        <p className="text-neutral-500 font-medium text-lg">Manage your network operators and internal team members.</p>
                    </div>

                    <Button className="bg-neutral-950 text-white font-semibold rounded-md px-8 h-10 shadow-sm transition-colors duration-150 gap-2">
                        <Plus size={18} />
                        Invite Member
                    </Button>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    {[
                        { label: "Total Members", value: "248", icon: Users, color: "bg-indigo-50 text-indigo-600" },
                        { label: "Active Now", value: "42", icon: Activity, color: "bg-emerald-50 text-emerald-600" },
                        { label: "Verified Operators", value: "186", icon: CheckCircle2, color: "bg-blue-50 text-blue-600" },
                    ].map((stat, i) => (
                        <Card key={i} className="border-none shadow-sm bg-white">
                            <CardContent className="p-6 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-neutral-500 mb-1">{stat.label}</p>
                                    <p className="text-3xl font-semibold text-neutral-950">{stat.value}</p>
                                </div>
                                <div className={`w-12 h-12 rounded-md flex items-center justify-center ${stat.color}`}>
                                    <stat.icon size={24} />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Users Table */}
                <Card className="border-none shadow-sm bg-white overflow-hidden rounded-lg">
                    <CardHeader className="p-6 border-b border-neutral-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-1">
                            <CardTitle className="text-xl font-semibold text-neutral-900">All Members</CardTitle>
                            <CardDescription className="text-neutral-500 font-medium">A list of all users on your network currently.</CardDescription>
                        </div>
                        <div className="relative w-full md:w-[300px]">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
                            <Input
                                placeholder="Search by name or email..."
                                className="pl-12 h-10 bg-white border-neutral-200 rounded-md focus:ring-2 ring-indigo-500/10 transition-colors duration-150 font-medium"
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-white/50">
                                        <th className="px-6 py-4 text-xs font-semibold text-neutral-500">Member</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-neutral-500">Role</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-neutral-500">Status</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-neutral-500">Activity</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold text-neutral-500">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-50">
                                    {TEAM_MEMBERS.map((member) => (
                                        <tr key={member.id} className="group hover:bg-white/50 transition-colors duration-150">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-md overflow-hidden border-2 border-white shadow-sm">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" />
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-neutral-900">{member.name}</p>
                                                        <p className="text-sm text-neutral-500 font-medium">{member.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    {member.role === "Admin" ? (
                                                        <Shield size={14} className="text-indigo-600" />
                                                    ) : (
                                                        <Users size={14} className="text-neutral-400" />
                                                    )}
                                                    <span className="text-sm font-semibold text-neutral-700">{member.role}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge className={
                                                    member.status === "Active"
                                                        ? "bg-emerald-50 text-emerald-600 border-none font-semibold text-xs px-3 py-1 rounded-full"
                                                        : "bg-white text-neutral-500 border-none font-semibold text-xs px-3 py-1 rounded-full"
                                                }>
                                                    {member.status}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium text-neutral-500">
                                                {member.lastActive}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Button variant="ghost" size="icon" className="hover:bg-white hover:shadow-sm rounded-md transition-colors duration-150">
                                                    <MoreHorizontal size={18} className="text-neutral-400" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                    <div className="p-6 border-t border-neutral-50 bg-white/30 flex items-center justify-between">
                        <p className="text-sm text-neutral-500 font-medium">Showing 4 of 248 members</p>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="h-10 font-semibold text-xs rounded-md transition-colors duration-150">Previous</Button>
                            <Button variant="outline" size="sm" className="h-10 font-semibold text-xs rounded-md bg-white shadow-sm border-neutral-200 transition-colors duration-150">Next</Button>
                        </div>
                    </div>
                </Card>
            </main>
        </div>
    );
}
