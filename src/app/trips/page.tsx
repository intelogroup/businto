"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Calendar, Clock, RefreshCw, Loader2, Bus, Heart, Plane } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Navbar } from "@/components/navbar";

type TransportRequest = {
  id: string;
  service_type: 'school' | 'medical' | 'wedding';
  pickup_address: string;
  dropoff_address: string;
  start_time: string;
  start_date: string;
  status: string;
  created_at: string;
  metadata: Record<string, any>;
  metadata_safe?: Record<string, any>;
  quotes?: { count: number }[];
};

export default function TripsPage() {
  const [trips, setTrips] = useState<TransportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'school' | 'medical' | 'wedding'>('all');

  const fetchTrips = async () => {
    setLoading(true);
    try {
      // NOTE: Avoid selecting quotes via anon client to prevent RLS failures
      let query = supabase
        .from('transport_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('service_type', filter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTrips(data || []);
    } catch (error) {
      console.error('Error fetching trips:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips();
  }, [filter]);

  const getStatusBadge = (trip: TransportRequest) => {
    const quotesCount = trip.quotes?.[0]?.count || 0;
    
    if (quotesCount > 0) {
      return <Badge className="bg-blue-500 hover:bg-blue-600">Quoted ({quotesCount})</Badge>;
    }
    
    switch (trip.status) {
      case 'pending':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Pending</Badge>;
      case 'matched':
        return <Badge className="bg-purple-500 hover:bg-purple-600">Matching</Badge>;
      case 'booked':
        return <Badge className="bg-green-500 hover:bg-green-600">Booked</Badge>;
      case 'completed':
        return <Badge className="bg-neutral-500 hover:bg-neutral-600">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getServiceIcon = (serviceType: string) => {
    switch (serviceType) {
      case 'school':
        return <Bus className="h-5 w-5" />;
      case 'medical':
        return <Heart className="h-5 w-5" />;
      case 'wedding':
        return <Plane className="h-5 w-5" />;
      default:
        return <Bus className="h-5 w-5" />;
    }
  };

  const getServiceBadge = (serviceType: string) => {
    const config = {
      school: { label: 'School Run', className: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
      medical: { label: 'Care Ride', className: 'bg-green-100 text-green-700 hover:bg-green-200' },
      wedding: { label: 'Event Shuttle', className: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' },
    };
    
    const { label, className } = config[serviceType as keyof typeof config] || config.school;
    return <Badge variant="outline" className={className}>{label}</Badge>;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return 'Not set';
    // Handle both HH:MM:SS and HH:MM formats
    const parts = timeString.split(':');
    const hours = parseInt(parts[0]);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes} ${ampm}`;
  };

  const filteredTrips = trips;

  return (
    <div className="min-h-screen bg-neutral-50">
      <Navbar />

      {/* Content */}
      <div className="container mx-auto max-w-7xl px-6 py-8 pt-24">
        {/* Filters */}
        <Tabs defaultValue="all" className="mb-8" onValueChange={(value) => setFilter(value as any)}>
          <TabsList className="grid w-full max-w-md grid-cols-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="school">School</TabsTrigger>
            <TabsTrigger value="medical">Medical</TabsTrigger>
            <TabsTrigger value="wedding">Event Shuttle</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredTrips.length === 0 && (
          <Card className="p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center">
                <Bus className="h-8 w-8 text-neutral-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-neutral-900">No trips found</h3>
                <p className="text-sm text-neutral-600 mt-1">
                  {filter === 'all' 
                    ? "You haven't submitted any transportation requests yet."
                    : `No ${filter} trips found.`}
                </p>
              </div>
              <Link href="/">
                <Button className="mt-4">Book Your First Trip</Button>
              </Link>
            </div>
          </Card>
        )}

        {/* Trips Grid */}
        {!loading && filteredTrips.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTrips.map((trip) => (
              <Card key={trip.id} className="p-6 hover:shadow-lg transition-shadow duration-200">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      trip.service_type === 'school' && "bg-amber-100 text-amber-600",
                      trip.service_type === 'medical' && "bg-green-100 text-green-600",
                      trip.service_type === 'wedding' && "bg-indigo-100 text-indigo-600"
                    )}>
                      {getServiceIcon(trip.service_type)}
                    </div>
                    <div>
                      <div className="font-mono text-xs text-neutral-500">
                        #{trip.id.slice(0, 8)}
                      </div>
                      {getServiceBadge(trip.service_type)}
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div className="mb-4">
                  {getStatusBadge(trip)}
                </div>

                {/* Location */}
                <div className="space-y-3 mb-4">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-neutral-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <div className="font-medium text-neutral-900">{trip.pickup_address || 'Not specified'}</div>
                      {trip.dropoff_address && (
                        <>
                          <div className="text-neutral-400 my-1">→</div>
                          <div className="font-medium text-neutral-900">{trip.dropoff_address}</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Date & Time */}
                <div className="flex items-center gap-4 text-sm text-neutral-600 pt-4 border-t border-neutral-100">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {trip.start_date ? formatDate(trip.start_date) : formatDate(trip.created_at)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {formatTime(trip.start_time)}
                  </div>
                </div>

                {/* Metadata */}
                {trip.service_type === 'medical' && trip.metadata_safe?.mobility_level && (
                  <div className="mt-3 text-xs text-neutral-500">
                    Mobility: <span className="font-semibold capitalize">{trip.metadata_safe.mobility_level}</span>
                  </div>
                )}
                {trip.service_type === 'wedding' && trip.metadata_safe?.guest_count && (
                  <div className="mt-3 text-xs text-neutral-500">
                    Guests: <span className="font-semibold">{trip.metadata_safe.guest_count}</span>
                  </div>
                )}
                {trip.service_type === 'school' && trip.metadata_safe?.student_count && (
                  <div className="mt-3 text-xs text-neutral-500">
                    Students: <span className="font-semibold">{trip.metadata_safe.student_count}</span>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
