"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, DollarSign, User } from "lucide-react";
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
  // Joined booking data for trip history
  bookings?: {
    id: string;
    status: string;
    total_cost: number | null;
    operator: {
      company_name: string;
    } | null;
  }[];
};

const SERVICE_CONFIG = {
  school:  { label: 'School Run',      dot: 'bg-amber-400' },
  medical: { label: 'Care Ride',       dot: 'bg-sky-400'   },
  wedding: { label: 'Event Shuttle',   dot: 'bg-violet-400' },
} as const;

export default function TripsPage() {
  const [trips, setTrips] = useState<TransportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'school' | 'medical' | 'wedding'>('all');

  const fetchTrips = async () => {
    setLoading(true);
    const supabase = createClient();
    try {
      let query = supabase
        .from('transport_requests')
        .select(`
          *,
          quotes(count),
          bookings(
            id,
            status,
            total_cost,
            operator:operators!bookings_operator_id_fkey(company_name)
          )
        `)
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

  useEffect(() => { fetchTrips(); }, [filter]);

  const getStatusBadge = (trip: TransportRequest) => {
    const quotesCount = trip.quotes?.[0]?.count || 0;

    if (trip.status === 'booked' || trip.status === 'completed' || trip.status === 'cancelled') {
      switch (trip.status) {
        case 'booked':
          return <Badge className="bg-emerald-500 hover:bg-emerald-600 border-0 text-[10px] h-5 px-1.5">Booked</Badge>;
        case 'completed':
          return <Badge className="bg-neutral-600 text-white hover:bg-neutral-700 border-0 text-[10px] h-5 px-1.5">Completed</Badge>;
        case 'cancelled':
          return <Badge variant="destructive" className="border-0 text-[10px] h-5 px-1.5">Cancelled</Badge>;
      }
    }

    if (quotesCount > 0) {
      return (
        <Badge className="bg-indigo-500 hover:bg-indigo-600 border-0 text-[10px] h-5 px-1.5">
          {quotesCount} {quotesCount === 1 ? 'Quote' : 'Quotes'}
        </Badge>
      );
    }

    switch (trip.status) {
      case 'pending':
        return <Badge className="bg-amber-400 text-amber-950 hover:bg-amber-500 border-0 text-[10px] h-5 px-1.5">Searching</Badge>;
      case 'matched':
        return <Badge className="bg-sky-500 hover:bg-sky-600 border-0 text-[10px] h-5 px-1.5">Matching</Badge>;
      default:
        return <Badge variant="outline" className="text-neutral-400 border-neutral-200 text-[10px] h-5 px-1.5">Processing</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return '—';
    const parts = timeString.split(':');
    const hours = parseInt(parts[0]);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    return `${hours % 12 || 12}:${minutes} ${ampm}`;
  };

  const activeTrips = trips.filter(trip => !['completed', 'cancelled'].includes(trip.status));
  const pastTrips   = trips.filter(trip =>  ['completed', 'cancelled'].includes(trip.status));
  const filteredActive = filter === 'all' ? activeTrips : activeTrips.filter(t => t.service_type === filter);
  const filteredPast   = filter === 'all' ? pastTrips   : pastTrips.filter(t =>   t.service_type === filter);

  const TripGrid = ({ items, emptyMessage }: { items: TransportRequest[], emptyMessage: string }) => {
    if (items.length === 0) {
      return (
        <p className="py-6 text-sm text-neutral-400">{emptyMessage}</p>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((trip) => {
          const svc = SERVICE_CONFIG[trip.service_type] ?? SERVICE_CONFIG.school;
          return (
            <Link key={trip.id} href={`/trips/${trip.id}`} className="group outline-none">
              <Card className="p-4 flex flex-col gap-3 transition-colors duration-150 hover:border-neutral-300 focus-visible:outline-none focus-visible:ring-0 cursor-pointer">
                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", svc.dot)} />
                    <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">{svc.label}</span>
                    <span className="text-[10px] font-mono text-neutral-300">#{trip.id.slice(0, 6)}</span>
                  </div>
                  {getStatusBadge(trip)}
                </div>

                {/* Route */}
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-neutral-900 line-clamp-1">{trip.pickup_address || 'Not specified'}</p>
                  {trip.dropoff_address && (
                    <p className="text-sm text-neutral-500 line-clamp-1">{trip.dropoff_address}</p>
                  )}
                </div>

                {/* Operator + Cost (when booked) */}
                {trip.bookings?.[0] && (
                  <div className="flex items-center justify-between gap-2 text-xs">
                    {trip.bookings[0].operator?.company_name && (
                      <span className="flex items-center gap-1 text-neutral-600 truncate">
                        <User className="h-3 w-3 shrink-0 text-neutral-400" />
                        {trip.bookings[0].operator.company_name}
                      </span>
                    )}
                    {trip.bookings[0].total_cost != null && (
                      <span className="flex items-center gap-0.5 font-semibold text-neutral-900 shrink-0">
                        <DollarSign className="h-3 w-3 text-neutral-400" />
                        {trip.bookings[0].total_cost.toFixed(2)}
                      </span>
                    )}
                  </div>
                )}

                {/* Footer */}
                <p className="text-xs text-neutral-400 pt-3 border-t border-neutral-100">
                  {trip.start_date ? formatDate(trip.start_date) : formatDate(trip.created_at)} · {formatTime(trip.start_time)}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background selection:bg-black selection:text-white">
      <Navbar />

      <div className="container mx-auto max-w-7xl px-6 py-8 pt-32 pb-24">

        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-950 mb-1">My Trips</h1>
            <p className="text-sm text-neutral-500">Transportation requests and incoming quotes.</p>
          </div>
          <Tabs defaultValue="all" onValueChange={(value) => setFilter(value as any)}>
            <TabsList className="grid w-full sm:w-auto grid-cols-4 p-1 bg-white border border-neutral-200 shadow-sm rounded-lg">
              <TabsTrigger value="all"     className="rounded-lg text-[13px] font-semibold">All</TabsTrigger>
              <TabsTrigger value="school"  className="rounded-lg text-[13px] font-semibold">School</TabsTrigger>
              <TabsTrigger value="medical" className="rounded-lg text-[13px] font-semibold">Medical</TabsTrigger>
              <TabsTrigger value="wedding" className="rounded-lg text-[13px] font-semibold">Event</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-300" />
          </div>
        )}

        {/* Empty — no trips at all */}
        {!loading && trips.length === 0 && (
          <div className="py-24 text-center">
            <p className="text-sm text-neutral-500 mb-4">No transportation requests yet.</p>
            <Link href="/">
              <Button variant="outline" className="rounded-lg">Book your first trip</Button>
            </Link>
          </div>
        )}

        {/* Trips */}
        {!loading && trips.length > 0 && (
          <div className="space-y-10">
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Active</h2>
                {filteredActive.length > 0 && (
                  <span className="text-[10px] font-bold bg-neutral-950 text-white px-1.5 py-0.5 rounded-full">
                    {filteredActive.length}
                  </span>
                )}
              </div>
              <TripGrid
                items={filteredActive}
                emptyMessage={filter === 'all' ? "No active trips." : `No active ${filter} trips.`}
              />
            </section>

            {filteredPast.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide">Past</h2>
                <TripGrid items={filteredPast} emptyMessage="No past trips." />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
