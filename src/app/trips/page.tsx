"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, DollarSign, User, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [trips, setTrips] = useState<TransportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'school' | 'medical' | 'wedding'>('all');
  const [reRequestingId, setReRequestingId] = useState<string | null>(null);
  const PAGE_SIZE = 20;

  const handleReRequest = async (tripId: string, e: React.MouseEvent) => {
    e.preventDefault(); // prevent the parent Link from navigating
    e.stopPropagation();
    setReRequestingId(tripId);
    try {
      const res = await fetch(`/api/trips/${tripId}/re-request`);
      if (!res.ok) {
        console.error('[Re-request] Failed to fetch trip data', await res.text());
        return;
      }
      const { trip } = await res.json();

      // Map API response to the form draft shape that Forms component reads from sessionStorage
      const metaSafe = trip.metadata_safe ?? {};
      const draft: Record<string, any> = {
        activeTab: trip.service_type === 'wedding' ? 'wedding' : trip.service_type,
      };

      if (trip.service_type === 'school') {
        if (trip.pickup_address) draft.pickupZip = trip.pickup_address;
        if (metaSafe.school_name) draft.schoolName = metaSafe.school_name;
        if (metaSafe.grade_level) draft.gradeLevel = metaSafe.grade_level;
        if (metaSafe.schedule_type) draft.scheduleType = metaSafe.schedule_type;
        if (metaSafe.am_time) draft.amTime = metaSafe.am_time;
        if (metaSafe.pm_time) draft.pmTime = metaSafe.pm_time;
        if (trip.start_date) draft.startDate = trip.start_date;
        if (trip.end_date) draft.endDate = trip.end_date;
        if (metaSafe.student_count) draft.studentCount = String(metaSafe.student_count);
      } else if (trip.service_type === 'medical') {
        if (trip.pickup_address) draft.pickupLocation = trip.pickup_address;
        if (trip.dropoff_address) draft.dropoffLocation = trip.dropoff_address;
        if (metaSafe.mobility_level) draft.mobilityLevel = metaSafe.mobility_level;
        if (trip.start_date) draft.appointmentDate = trip.start_date;
        if (trip.start_time) draft.appointmentTime = trip.start_time;
        if (metaSafe.service_level) draft.serviceLevel = metaSafe.service_level;
        if (metaSafe.trip_type) draft.tripType = metaSafe.trip_type;
        if (metaSafe.oxygen_use !== undefined) draft.oxygenUse = metaSafe.oxygen_use;
        if (metaSafe.is_bariatric !== undefined) draft.isBariatric = metaSafe.is_bariatric;
        if (metaSafe.facility_details) draft.facilityDetails = metaSafe.facility_details;
        if (metaSafe.stair_factor) draft.stairFactor = metaSafe.stair_factor;
        if (metaSafe.return_status) draft.returnStatus = metaSafe.return_status;
        if (metaSafe.additional_passengers) draft.additionalPassengers = String(metaSafe.additional_passengers);
        if (metaSafe.service_animal !== undefined) draft.serviceAnimal = metaSafe.service_animal;
      } else if (trip.service_type === 'wedding') {
        if (trip.pickup_address) draft.hotelZip = trip.pickup_address;
        if (trip.dropoff_address) draft.venueZip = trip.dropoff_address;
        if (trip.start_date) draft.eventDate = trip.start_date;
        if (metaSafe.guest_count) draft.guestCount = String(metaSafe.guest_count);
        if (metaSafe.vehicle_style) draft.vehicleStyle = metaSafe.vehicle_style;
        if (metaSafe.itinerary_type) draft.itineraryType = metaSafe.itinerary_type;
        if (trip.start_time) draft.pickupTime = trip.start_time;
      }

      sessionStorage.setItem('businto_form_draft', JSON.stringify(draft));
      router.push('/');
    } catch (err) {
      console.error('[Re-request] Unexpected error:', err);
    } finally {
      setReRequestingId(null);
    }
  };

  const fetchTrips = async (append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    const supabase = createClient();
    try {
      const from = append ? trips.length : 0;
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
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (filter !== 'all') {
        query = query.eq('service_type', filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      const newTrips = data || [];
      setHasMore(newTrips.length === PAGE_SIZE);
      if (append) {
        setTrips(prev => [...prev, ...newTrips]);
      } else {
        setTrips(newTrips);
      }
    } catch (err) {
      console.error('Error fetching trips:', err);
      if (!append) setError('Unable to load your trips. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
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

  const TripGrid = ({
    items,
    emptyMessage,
    showReRequest = false,
  }: {
    items: TransportRequest[];
    emptyMessage: string;
    showReRequest?: boolean;
  }) => {
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
                <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
                  <p className="text-xs text-neutral-400">
                    {trip.start_date ? formatDate(trip.start_date) : formatDate(trip.created_at)} · {formatTime(trip.start_time)}
                  </p>
                  {showReRequest && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px] text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 gap-1"
                      onClick={(e) => handleReRequest(trip.id, e)}
                      disabled={reRequestingId === trip.id}
                      aria-label="Re-request this trip"
                    >
                      {reRequestingId === trip.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      Re-request
                    </Button>
                  )}
                </div>
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
          <Tabs defaultValue="all" onValueChange={(value) => { setFilter(value as any); setHasMore(true); }}>
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

        {/* Error */}
        {!loading && error && (
          <div className="py-24 text-center">
            <p className="text-sm text-red-500 mb-4">{error}</p>
            <Button variant="outline" className="rounded-lg" onClick={() => { setError(null); fetchTrips(); }}>
              Try Again
            </Button>
          </div>
        )}

        {/* Empty — no trips at all */}
        {!loading && !error && trips.length === 0 && (
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
                <TripGrid items={filteredPast} emptyMessage="No past trips." showReRequest />
              </section>
            )}

            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => fetchTrips(true)}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Load More
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
