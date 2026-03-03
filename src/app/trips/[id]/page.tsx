"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Calendar, Clock, RefreshCw, Loader2, Bus, Heart, Plane, ChevronLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Navbar } from "@/components/navbar";
import { QuoteCard } from "@/components/quote-card";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";

interface Quote {
    id: string;
    total_price: number;
    vehicle_type: string;
    note: string;
    status: string;
    operator_id: string;
    created_at: string;
    expires_at?: string;
    operator?: {
        company_name: string;
        full_name: string;
        avatar_url: string;
        rating?: number;
        review_count?: number;
    };
}

interface TransportRequest {
    id: string;
    service_type: 'school' | 'medical' | 'wedding';
    pickup_address: string;
    dropoff_address: string;
    pickup_fuzzy: string;
    dropoff_fuzzy: string;
    start_time: string;
    start_date: string;
    status: string;
    created_at: string;
    metadata_safe?: Record<string, any>;
}

function TripDetailContent() {
    const { id } = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const { user, isLoading: authLoading } = useAuth();
    const { addNotification } = useNotifications();
    const [trip, setTrip] = useState<TransportRequest | null>(null);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [loading, setLoading] = useState(true);
    const [acceptingQuoteId, setAcceptingQuoteId] = useState<string | null>(null);

    const logClientError = async (message: string, metadata: any = {}) => {
        try {
            await fetch('/api/logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event_type: 'trip_detail_page_error',
                    status: 'error',
                    message,
                    request_id: id,
                    metadata: {
                        ...metadata,
                        has_user: !!user,
                        has_token: !!token
                    }
                })
            });
        } catch (e) {
            console.error('Failed to send error log to server', e);
        }
    };

    const fetchData = async () => {
        // Don't start fetching until auth is determined
        if (authLoading) return;
        
        setLoading(true);
        console.log("[TripDetail] Fetching data, auth state:", { hasUser: !!user });

        // Log page open
        fetch('/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_type: 'trip_detail_page_open',
                status: 'success',
                message: 'User opened trip detail page',
                request_id: id,
                metadata: {
                    has_user: !!user,
                    has_token: !!token
                }
            })
        }).catch(e => console.error('Failed to log page open', e));

        const supabase = createClient();
        
        // 1. If we have a user OR no token, try fetching via standard client (RLS)
        if (user || !token) {
            try {
                console.log("[TripDetail] Attempting standard fetch...");
                const { data: tripData, error: tripError } = await supabase
                    .from('transport_requests')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (tripError) {
                    console.error('Trip fetch error:', tripError);
                    if (tripError.code !== 'PGRST116') { // PGRST116 is not found
                        logClientError("Supabase Trip Fetch Error", { error: tripError });
                    }
                }

                if (tripData) {
                    setTrip(tripData);

                    // Fetch quotes
                    const { data: quotesData, error: quotesError } = await supabase
                        .from('quotes')
                        .select(`
                  *,
                  operator:operators!quotes_operator_id_fkey (
                    id,
                    company_name,
                    company_email,
                    company_phone,
                    rating,
                    total_reviews,
                    cori_verified,
                    insurance_verified,
                    profile:operator_profiles!profile_id (
                      full_name,
                      avatar_url
                    )
                  )
                `)
                        .eq('request_id', id)
                        .order('total_price', { ascending: true });

                    if (quotesError) {
                        console.error('Quotes fetch error:', quotesError);
                        logClientError("Supabase Quotes Fetch Error", { error: quotesError });
                    } else {
                        setQuotes(quotesData || []);
                        setLoading(false);
                        return; // Successfully loaded via session
                    }
                }
            } catch (err) {
                console.log('Standard fetch failed, will try token if available');
                logClientError("Standard Fetch Exception", { error: err instanceof Error ? err.message : err });
            }
        }

        // 3. Fallback to Token fetch (for unauthenticated operators)
        if (token) {
            try {
                const res = await fetch(`/api/trips/${id}?token=${token}`);
                if (res.ok) {
                    const data = await res.json();
                    setTrip(data.trip);
                    setQuotes(data.quotes);
                    setLoading(false);
                    return;
                } else {
                    const errText = await res.text();
                    logClientError("Token Fetch API Error", { status: res.status, error: errText });
                }
            } catch (err) {
                console.error('Token fetch failed:', err);
                logClientError("Token Fetch Exception", { error: err instanceof Error ? err.message : err });
            }
        }

        setLoading(false);
    };

    useEffect(() => {
        // If we have a token, fetch instantly. Otherwise, wait for auth to finish loading.
        if (id && (token || !authLoading)) {
            fetchData();
        }
    }, [id, authLoading, token]);

    const handleAcceptQuote = async (quoteId: string) => {
        if (!user && !token) {
            router.push(`/login?redirect=/trips/${id}`);
            return;
        }

        setAcceptingQuoteId(quoteId);
        try {
            const response = await fetch('/api/quotes/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quoteId,
                    tripRequestId: id,
                    userId: user?.id,
                    token
                })
            });

            if (!response.ok) {
                const error = await response.json();
                logClientError("Quote Acceptance Failed", { quoteId, error: error.error });
                throw new Error(error.error || 'Failed to accept quote');
            }

            // Log successful acceptance
            fetch('/api/logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event_type: 'trip_quote_accept_success',
                    status: 'success',
                    message: 'User accepted quote successfully',
                    request_id: id,
                    metadata: { quoteId }
                })
            }).catch(e => console.error('Failed to log acceptance success', e));

            // Success! Refresh data
            await fetchData();
            addNotification({ title: 'Quote Accepted', message: 'Your booking is confirmed. Check your email for details.', type: 'success' });
        } catch (error: any) {
            console.error('Error accepting quote:', error);
            logClientError("Quote Acceptance Exception", { quoteId, message: error.message });
            addNotification({ title: 'Error', message: error.message || 'Error accepting quote. Please try again.', type: 'error' });
        } finally {
            setAcceptingQuoteId(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background">
                <Navbar />
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
                </div>
            </div>
        );
    }

    if (!trip) {
        return (
            <div className="min-h-screen bg-background">
                <Navbar />
                <div className="container mx-auto max-w-7xl px-6 py-24 text-center">
                    <h2 className="text-2xl font-bold">
                        {(!user && !token) ? "Authentication Required" : "Trip not found"}
                    </h2>
                    <p className="text-neutral-500 mt-2">
                        {(!user && !token) 
                            ? "You need to be signed in to view these trip details." 
                            : "We couldn't find the trip you're looking for. It may have been deleted or moved."}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
                        {!user && (
                            <Link href={`/login?redirect=/trips/${id}`}>
                                <Button className="bg-black text-white px-8">
                                    Sign In to View
                                </Button>
                            </Link>
                        )}
                        <Link href="/">
                            <Button variant="outline">
                                Go to Homepage
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const getServiceIcon = (serviceType: string) => {
        switch (serviceType) {
            case 'school': return <Bus className="h-6 w-6" />;
            case 'medical': return <Heart className="h-6 w-6" />;
            case 'wedding': return <Plane className="h-6 w-6" />; // Using plane for wedding as per trips page
            default: return <Bus className="h-6 w-6" />;
        }
    };

    return (
        <div className="min-h-screen bg-background pb-20">
            <Navbar />

            <div className="container mx-auto max-w-4xl px-4 sm:px-6 pt-24">
                <Link href="/trips" className="flex items-center gap-2 text-neutral-500 hover:text-neutral-900 mb-6 transition-colors duration-150">
                    <ChevronLeft className="h-4 w-4" />
                    <span className="text-sm font-medium">Back to Trips</span>
                </Link>

                {/* Trip Header */}
                <div className="bg-white rounded-lg p-6 md:p-8 shadow-sm border border-neutral-200 mb-8">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                        <div className="flex items-start gap-4">
                            <div className={cn(
                                "w-12 h-12 rounded flex items-center justify-center",
                                trip.service_type === 'school' && "bg-amber-100 text-amber-600",
                                trip.service_type === 'medical' && "bg-sky-100 text-sky-600",
                                trip.service_type === 'wedding' && "bg-violet-100 text-violet-600"
                            )}>
                                {getServiceIcon(trip.service_type)}
                            </div>
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <h1 className="text-2xl font-semibold text-neutral-900">
                                        {trip.service_type.charAt(0).toUpperCase() + trip.service_type.slice(1)} Trip
                                    </h1>
                                    <Badge className={cn(
                                        "text-[10px] h-5 px-1.5 font-bold uppercase",
                                        trip.status === 'booked' || trip.status === 'quote_accepted' ? "bg-green-600 hover:bg-green-600" : "bg-sky-600 hover:bg-sky-600"
                                    )}>
                                        {trip.status === 'quote_accepted' ? 'Booked' : trip.status}
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-neutral-400 font-mono uppercase tracking-wider">Request ID: {trip.id.slice(0, 8)}</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-sm text-neutral-600">
                                <Calendar className="h-4 w-4 text-neutral-400" />
                                <span className="font-medium">{new Date(trip.start_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-neutral-600">
                                <Clock className="h-4 w-4 text-neutral-400" />
                                <span className="font-medium">{trip.start_time?.slice(0, 5) || 'TBA'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mt-8 pt-8 border-t border-neutral-100">
                        <div>
                            <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-5">Route Details</h3>
                            <div className="space-y-5">
                                <div className="flex items-start gap-3">
                                    <div className="w-2 h-2 rounded-full bg-neutral-300 mt-1.5 shrink-0" />
                                    <div>
                                        <p className="text-[10px] text-neutral-400 uppercase font-bold tracking-tight mb-0.5">Pickup</p>
                                        <p className="text-sm font-medium text-neutral-900 leading-relaxed">{trip.pickup_address}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-2 h-2 rounded-full bg-neutral-900 mt-1.5 shrink-0" />
                                    <div>
                                        <p className="text-[10px] text-neutral-400 uppercase font-bold tracking-tight mb-0.5">Drop-off</p>
                                        <p className="text-sm font-medium text-neutral-900 leading-relaxed">{trip.dropoff_address}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-5">Requirements</h3>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                                {Object.entries(trip.metadata_safe || {}).map(([key, value]) => {
                                    if (typeof value === 'boolean' && value) {
                                        return (
                                            <div key={key} className="flex items-center gap-2 text-sm text-neutral-700">
                                                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                                <span className="font-medium capitalize">{key.replace(/_/g, ' ')}</span>
                                            </div>
                                        );
                                    }
                                    if (typeof value === 'string' || typeof value === 'number') {
                                        return (
                                            <div key={key} className="space-y-0.5">
                                                <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-tight">{key.replace(/_/g, ' ')}</span>
                                                <span className="text-neutral-900 font-semibold text-sm capitalize">{value}</span>
                                            </div>
                                        );
                                    }
                                    return null;
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quotes Section */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold text-neutral-900">
                            Available Quotes {quotes.length > 0 && `(${quotes.length})`}
                        </h2>
                    </div>

                    {quotes.length === 0 ? (
                        <Card className="p-16 text-center bg-white border-dashed border-2 border-neutral-200 shadow-none rounded-lg">
                            <RefreshCw className="h-8 w-8 text-neutral-300 mx-auto mb-4 animate-spin" />
                            <h3 className="text-lg font-semibold text-neutral-900">Broadcasting Request</h3>
                            <p className="text-sm text-neutral-500 mt-1 max-w-xs mx-auto">Operators are reviewing your route. Quotes usually arrive within 15–60 minutes.</p>
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            {quotes.map((quote, index) => (
                                <QuoteCard
                                    key={quote.id}
                                    quote={{
                                        id: quote.id,
                                        tripRequestId: id as string,
                                        operatorId: quote.operator_id,
                                        totalPrice: quote.total_price,
                                        baseFare: (quote as any).base_fare || quote.total_price,
                                        distanceCharge: (quote as any).distance_charge || 0,
                                        additionalFees: (quote as any).additional_fees || [],
                                        vehicleType: quote.vehicle_type,
                                        vehicleYear: (quote as any).vehicle_year || 2023,
                                        vehicleCapacity: (quote as any).vehicle_capacity || 14,
                                        operatorName: quote.operator?.company_name || (quote.operator as any)?.profile?.full_name || 'Anonymous Operator',
                                        operatorAvatar: (quote.operator as any)?.profile?.avatar_url || '',
                                        operatorPhone: (quote.operator as any)?.company_phone || undefined,
                                        operatorEmail: (quote.operator as any)?.company_email || undefined,
                                        operatorRating: (quote.operator as any)?.rating || 4.8,
                                        operatorReviewCount: (quote.operator as any)?.total_reviews || 12,
                                        responseTime: (quote as any).response_time_mins || 15,
                                        status: quote.status as any,
                                        isLowestPrice: index === 0,
                                        isHighestRated: false,
                                        coriCertified: (quote.operator as any)?.cori_verified || true,
                                        insuranceVerified: (quote.operator as any)?.insurance_verified || true,
                                        wheelchairAccessible: (quote as any).wheelchair_accessible || false,
                                        operatorNote: quote.note,
                                        createdAt: new Date(quote.created_at),
                                        expiresAt: quote.expires_at ? new Date(quote.expires_at) : new Date(Date.now() + 72 * 60 * 60 * 1000)
                                    }}
                                    onAccept={handleAcceptQuote}
                                    onDecline={() => { }}
                                    onMessage={() => { }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function TripDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <TripDetailContent />
        </Suspense>
    );
}
