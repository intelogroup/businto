"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
    const supabase = createClient();
    try {
      // NOTE: Use a count join to show how many quotes exist for each request
      let query = supabase
        .from('transport_requests')
        .select('*, quotes(count)')
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

    if (trip.status === 'booked' || trip.status === 'completed' || trip.status === 'cancelled') {
      // Show actual status if final
      switch (trip.status) {
        case 'booked':
          return <Badge className="bg-emerald-500 hover:bg-emerald-600 shadow-sm border-0">Booked</Badge>;
        case 'completed':
          return <Badge className="bg-neutral-600 text-white hover:bg-neutral-700 shadow-sm border-0">Completed</Badge>;
        case 'cancelled':
          return <Badge variant="destructive" className="shadow-sm border-0">Cancelled</Badge>;
      }
    }

    if (quotesCount > 0) {
      return (
        <Badge className="bg-indigo-500 hover:bg-indigo-600 shadow-sm border-0 animate-in fade-in zoom-in duration-300">
          {quotesCount} {quotesCount === 1 ? 'Quote' : 'Quotes'} Received
        </Badge>
      );
    }

    switch (trip.status) {
      case 'pending':
        return <Badge className="bg-amber-400 text-amber-950 hover:bg-amber-500 shadow-sm border-0">Looking for Operators...</Badge>;
      case 'matched':
        return <Badge className="bg-sky-500 hover:bg-sky-600 shadow-sm border-0">Matching in Progress</Badge>;
      default:
        return <Badge variant="outline" className="text-neutral-500 border-neutral-200">Processing</Badge>;
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

  // Separate active and past trips
  const activeTrips = trips.filter(trip => !['completed', 'cancelled'].includes(trip.status));
  const pastTrips = trips.filter(trip => ['completed', 'cancelled'].includes(trip.status));

  // Apply service_type filter
  const filteredActiveTrips = filter === 'all' ? activeTrips : activeTrips.filter(t => t.service_type === filter);
  const filteredPastTrips = filter === 'all' ? pastTrips : pastTrips.filter(t => t.service_type === filter);

  const TripGrid = ({ items, emptyMessage }: { items: TransportRequest[], emptyMessage: string }) => {
    if (items.length === 0) {
      return (
        <div className="py-8 text-center border-2 border-dashed border-neutral-100 rounded-lg bg-white/50">
          <p className="text-sm font-medium text-neutral-400">{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((trip) => (
          <Link key={trip.id} href={`/trips/${trip.id}`} className="group outline-none">
            <Card className="p-6 h-full transition-colors duration-150 duration-300  hover:shadow-black/5  hover:border-black/10 flex flex-col focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2">
              {/* Header */}
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-12 h-12 rounded-lg flex items-center justify-center transition-colors shadow-sm",
                    trip.service_type === 'school' && "bg-amber-100/80 text-amber-600 group-hover:bg-amber-100",
                    trip.service_type === 'medical' && "bg-green-100/80 text-green-600 group-hover:bg-green-100",
                    trip.service_type === 'wedding' && "bg-indigo-100/80 text-indigo-600 group-hover:bg-indigo-100"
                  )}>
                    {getServiceIcon(trip.service_type)}
                  </div>
                  <div className="space-y-1">
                    <div className="font-mono text-[10px] sm:text-xs font-bold uppercase tracking-widest text-neutral-400">
                      #{trip.id.slice(0, 8)}
                    </div>
                    {getServiceBadge(trip.service_type)}
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="mb-6">
                {getStatusBadge(trip)}
              </div>

              {/* Location */}
              <div className="space-y-4 mb-6 flex-grow">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex flex-col items-center gap-1">
                    <div className="w-2 h-2 rounded-full border-2 border-neutral-900 bg-white shadow-sm" />
                    {trip.dropoff_address && <div className="w-[1.5px] h-6 bg-neutral-200" />}
                  </div>
                  <div className="text-sm font-semibold text-neutral-900 leading-tight">
                    <div className="line-clamp-2">{trip.pickup_address || 'Not specified'}</div>
                  </div>
                </div>

                {trip.dropoff_address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-3.5 w-3.5 text-neutral-400 mt-0.5 ml-[-3px] flex-shrink-0" />
                    <div className="text-sm font-semibold text-neutral-900 leading-tight">
                      <div className="line-clamp-2">{trip.dropoff_address}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Date & Time */}
              <div className="flex items-center gap-5 text-[13px] font-medium text-neutral-500 pt-5 border-t border-neutral-100/80">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-neutral-400" />
                  {trip.start_date ? formatDate(trip.start_date) : formatDate(trip.created_at)}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-neutral-400" />
                  {formatTime(trip.start_time)}
                </div>
              </div>

              {/* Metadata Tags */}
              {(trip.metadata_safe?.mobility_level || trip.metadata_safe?.guest_count || trip.metadata_safe?.student_count) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {trip.service_type === 'medical' && trip.metadata_safe?.mobility_level && (
                    <span className="inline-flex items-center rounded-md bg-white px-2 py-1 text-xs font-semibold text-neutral-600 ring-1 ring-inset ring-neutral-500/10 capitalize">
                      Mobility: {trip.metadata_safe.mobility_level.replace('-', ' ')}
                    </span>
                  )}
                  {trip.service_type === 'wedding' && trip.metadata_safe?.guest_count && (
                    <span className="inline-flex items-center rounded-md bg-white px-2 py-1 text-xs font-semibold text-neutral-600 ring-1 ring-inset ring-neutral-500/10">
                      {trip.metadata_safe.guest_count} Guests
                    </span>
                  )}
                  {trip.service_type === 'school' && trip.metadata_safe?.student_count && (
                    <span className="inline-flex items-center rounded-md bg-white px-2 py-1 text-xs font-semibold text-neutral-600 ring-1 ring-inset ring-neutral-500/10">
                      {trip.metadata_safe.student_count} Students
                    </span>
                  )}
                </div>
              )}
            </Card>
          </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background selection:bg-black selection:text-white">
      <Navbar />

      {/* Content */}
      <div className="container mx-auto max-w-7xl px-6 py-8 pt-32 pb-24">

        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-950 mb-2">My Trips</h1>
            <p className="text-sm font-medium text-neutral-500">Manage your transportation requests and view incoming quotes.</p>
          </div>
          {/* Filters */}
          <Tabs defaultValue="all" onValueChange={(value) => setFilter(value as any)}>
            <TabsList className="grid w-full sm:w-auto grid-cols-4 p-1 bg-white border border-neutral-200 shadow-sm rounded-lg">
              <TabsTrigger value="all" className="rounded-lg text-[13px] font-bold">All</TabsTrigger>
              <TabsTrigger value="school" className="rounded-lg text-[13px] font-bold">School</TabsTrigger>
              <TabsTrigger value="medical" className="rounded-lg text-[13px] font-bold">Medical</TabsTrigger>
              <TabsTrigger value="wedding" className="rounded-lg text-[13px] font-bold">Event</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-10 w-10 animate-spin text-neutral-300 mb-4" />
            <p className="text-sm font-bold text-neutral-400 animate-pulse">Loading your trips...</p>
          </div>
        )}

        {/* Empty State (Total Empty) */}
        {!loading && trips.length === 0 && (
          <Card className="p-16 text-center border-0 shadow-lg shadow-black/5 bg-white rounded-lg">
            <div className="flex flex-col items-center gap-5 max-w-md mx-auto">
              <div className="w-20 h-20 rounded-lg bg-white border-2 border-dashed border-neutral-200 flex items-center justify-center">
                <Bus className="h-8 w-8 text-neutral-300" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-neutral-900 tracking-tight">No trips found</h3>
                <p className="text-[15px] font-medium text-neutral-500 leading-relaxed">
                  You haven't submitted any transportation requests yet. Book your first trip to get started.
                </p>
              </div>
              <Link href="/" className="w-full sm:w-auto mt-4">
                <Button size="lg" className="w-full rounded-lg bg-black text-white hover:bg-neutral-800 font-bold tracking-wide shadow-lg shadow-black/20">
                  Book Your First Trip
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {/* Trips Grid Lists */}
        {!loading && trips.length > 0 && (
          <div className="space-y-16">
            {/* Active Trips Section */}
            <section className="space-y-6">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold tracking-tight text-neutral-950">Active Trips</h2>
                {filteredActiveTrips.length > 0 && (
                  <div className="bg-neutral-950 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
                    {filteredActiveTrips.length}
                  </div>
                )}
              </div>
              <TripGrid
                items={filteredActiveTrips}
                emptyMessage={filter === 'all' ? "No active trips right now." : `No active ${filter} trips right now.`}
              />
            </section>

            {/* Past Trips Section */}
            {filteredPastTrips.length > 0 && (
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold tracking-tight text-neutral-950">Past Trips</h2>
                  <div className="bg-white text-neutral-500 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
                    {filteredPastTrips.length}
                  </div>
                </div>
                <TripGrid
                  items={filteredPastTrips}
                  emptyMessage="No past trips."
                />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
