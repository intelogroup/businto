"use client";
import React, { Suspense, useState, useEffect } from 'react';
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/navbar";
import { Forms } from "@/components/forms";
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
import Link from 'next/link';

function DashboardContent() {
    const { user, isLoading: authLoading } = useAuth();
    const [recentTrips, setRecentTrips] = useState<any[]>([]);
    const [tripsLoaded, setTripsLoaded] = useState(false);

    useEffect(() => {
        const fetchRecentTrips = async () => {
            if (authLoading) return;
            if (!user) return;

            try {
                const response = await fetch('/api/requests');
                if (response.ok) {
                    const result = await response.json();
                    const trips = Array.isArray(result) ? result : (result.requests || []);
                    setRecentTrips(trips.slice(0, 6));
                }
            } catch (error) {
                console.error('Error fetching recent trips:', error);
            } finally {
                setTripsLoaded(true);
            }
        };
        fetchRecentTrips();
    }, [user, authLoading]);

    return (
        <div className="min-h-screen bg-background">
            <Navbar />

            {/* Full hero form — identical to landing page */}
            <Forms hideRecentTrips={true} />

            {/* Recent Trips — empty state */}
            {tripsLoaded && user && recentTrips.length === 0 && (
                <div className="container mx-auto max-w-[1600px] px-4 sm:px-8 md:px-12 lg:px-16 pb-20 text-center">
                    <p className="text-sm text-neutral-500">No trips yet. Submit your first request above to get started.</p>
                </div>
            )}

            {/* Recent Trips Section */}
            {recentTrips.length > 0 && (
                <div className="container mx-auto max-w-[1600px] px-4 sm:px-8 md:px-12 lg:px-16 pb-20 font-sans">
                    <h2 className="text-2xl font-semibold text-neutral-900 mb-6">Your Recent Trips</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {recentTrips.map((trip) => (
                            <Link href={`/trips/${trip.id}`} key={trip.id}>
                                <Card className="p-5 shadow-sm hover:border-neutral-300 transition-colors duration-150 cursor-pointer">
                                    {/* Header */}
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-9 h-9 rounded flex items-center justify-center ${trip.service_type === 'school' ? 'bg-amber-100 text-amber-600' :
                                                trip.service_type === 'medical' ? 'bg-sky-100 text-sky-600' :
                                                    'bg-violet-100 text-violet-600'
                                                }`}>
                                                {trip.service_type === 'school' ? <Bus className="h-4 w-4" /> :
                                                    trip.service_type === 'medical' ? <Heart className="h-4 w-4" /> :
                                                        <Plane className="h-4 w-4" />}
                                            </div>
                                            <div>
                                                <div className="font-mono text-[10px] text-neutral-400 uppercase">ID: {trip.id.slice(0, 8)}</div>
                                                <Badge variant="outline" className={`text-[10px] h-5 px-1.5 font-semibold ${trip.service_type === 'school' ? 'border-amber-200 text-amber-700' :
                                                    trip.service_type === 'medical' ? 'border-sky-200 text-sky-700' :
                                                        'border-violet-200 text-violet-700'
                                                    }`}>
                                                    {trip.service_type === 'school' ? 'School Run' :
                                                        trip.service_type === 'medical' ? 'Care Ride' : 'Event Shuttle'}
                                                </Badge>
                                            </div>
                                        </div>
                                        <Badge className={`text-[10px] h-5 px-1.5 font-semibold ${trip.status === 'pending' ? 'bg-amber-500 hover:bg-amber-500' :
                                            trip.status === 'quoted' ? 'bg-violet-500 hover:bg-violet-500' :
                                                trip.status === 'booked' ? 'bg-green-600 hover:bg-green-600' :
                                                    'bg-white0 hover:bg-white0'
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
                            </Link>
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
