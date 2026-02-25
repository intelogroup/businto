"use client";
import React, { Suspense, useState, useEffect } from 'react';
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    MapPin,
    Calendar,
    Clock,
    Bus,
    Heart,
    Plane
} from "lucide-react";

function DashboardContent() {
    const { user } = useAuth();
    const [recentTrips, setRecentTrips] = useState<any[]>([]);

    useEffect(() => {
        const fetchRecentTrips = async () => {
            try {
                const response = await fetch('/api/requests');
                if (response.ok) {
                    const result = await response.json();
                    const trips = Array.isArray(result) ? result : (result.requests || []);
                    setRecentTrips(trips.slice(0, 6));
                }
            } catch (error) {
                console.error('Error fetching recent trips:', error);
            }
        };
        fetchRecentTrips();
    }, []);

    return (
        <div className="min-h-screen bg-background">
            <Navbar />

            {/* Full hero form — identical to landing page */}
            <Hero />

            {/* Recent Trips Section */}
            {recentTrips.length > 0 && (
                <div className="container mx-auto max-w-[1600px] px-4 sm:px-8 md:px-12 lg:px-16 pb-20 font-sans">
                    <h2 className="text-2xl font-bold text-neutral-900 mb-4">Your Recent Trips</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {recentTrips.map((trip) => (
                            <Card key={trip.id} className="p-5 hover:shadow-lg transition-shadow duration-200">
                                {/* Header */}
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${trip.service_type === 'school' ? 'bg-amber-100 text-amber-600' :
                                                trip.service_type === 'medical' ? 'bg-green-100 text-green-600' :
                                                    'bg-indigo-100 text-indigo-600'
                                            }`}>
                                            {trip.service_type === 'school' ? <Bus className="h-4 w-4" /> :
                                                trip.service_type === 'medical' ? <Heart className="h-4 w-4" /> :
                                                    <Plane className="h-4 w-4" />}
                                        </div>
                                        <div>
                                            <div className="font-mono text-xs text-neutral-500">#{trip.id.slice(0, 8)}</div>
                                            <Badge variant="outline" className={`text-xs ${trip.service_type === 'school' ? 'bg-amber-50 text-amber-700' :
                                                    trip.service_type === 'medical' ? 'bg-green-50 text-green-700' :
                                                        'bg-indigo-50 text-indigo-700'
                                                }`}>
                                                {trip.service_type === 'school' ? 'School Run' :
                                                    trip.service_type === 'medical' ? 'Care Ride' : 'Event Shuttle'}
                                            </Badge>
                                        </div>
                                    </div>
                                    <Badge className={`text-xs ${trip.status === 'pending' ? 'bg-yellow-500' :
                                            trip.status === 'quoted' ? 'bg-purple-500' :
                                                trip.status === 'booked' ? 'bg-green-500' :
                                                    'bg-neutral-500'
                                        }`}>
                                        {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
                                    </Badge>
                                </div>

                                {/* Location */}
                                <div className="space-y-2 mb-3">
                                    <div className="flex items-start gap-2">
                                        <MapPin className="h-3.5 w-3.5 text-neutral-400 mt-0.5 flex-shrink-0" />
                                        <div className="text-xs">
                                            <div className="font-medium text-neutral-900 line-clamp-1">
                                                {trip.pickup_fuzzy || 'Not specified'}
                                            </div>
                                            {trip.dropoff_fuzzy && (
                                                <>
                                                    <div className="text-neutral-400 my-0.5">→</div>
                                                    <div className="font-medium text-neutral-900 line-clamp-1">
                                                        {trip.dropoff_fuzzy}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Date & Time */}
                                <div className="flex items-center gap-3 text-xs text-neutral-600 pt-3 border-t border-neutral-100">
                                    <div className="flex items-center gap-1">
                                        <Calendar className="h-3.5 w-3.5" />
                                        {new Date(trip.start_date || trip.created_at).toLocaleDateString('en-US', {
                                            month: 'short', day: 'numeric'
                                        })}
                                    </div>
                                    {trip.start_time && (
                                        <div className="flex items-center gap-1">
                                            <Clock className="h-3.5 w-3.5" />
                                            {trip.start_time.slice(0, 5)}
                                        </div>
                                    )}
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function DashboardPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <DashboardContent />
        </Suspense>
    );
}
