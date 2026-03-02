"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, Clock, ChevronLeft, Bus, Heart, Plane, CheckCircle2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Navbar } from "@/components/navbar";
import { QuoteCard } from "@/components/quote-card";
import { useAuth } from "@/hooks/use-auth";

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
        total_reviews?: number;
        company_email?: string;
        company_phone?: string;
        profile?: {
            full_name: string;
            avatar_url: string;
        };
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

function TripViewContent() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const { user, isLoading: authLoading } = useAuth();
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
                    event_type: 'trip_view_page_error',
                    status: 'error',
                    message,
                    request_id: trip?.id || id,
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
        if (authLoading) return;
        
        setLoading(true);
        console.log("[TripView] Fetching data, hasToken:", !!token);

        const supabase = createClient();
        
        // 1. Standard Fetch (if ID exists)
        if (id && (user || !token)) {
            try {
                const { data: tripData } = await supabase
                    .from('transport_requests')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (tripData) {
                    setTrip(tripData);
                    const { data: quotesData } = await supabase
                        .from('quotes')
                        .select(`
                            *,
                            operator:operators!quotes_operator_id_fkey (
                                id, company_name, company_email, company_phone, rating, total_reviews, cori_verified, insurance_verified,
                                profile:operator_profiles!profile_id (full_name, avatar_url)
                            )
                        `)
                        .eq('request_id', id)
                        .order('total_price', { ascending: true });

                    if (quotesData) {
                        setQuotes(quotesData || []);
                        setLoading(false);
                        return;
                    }
                }
            } catch (err) {
                console.error('Standard fetch failed', err);
            }
        }

        // 2. Token Fetch (Immune to ID mangling)
        if (token) {
            try {
                const apiUrl = id 
                    ? `/api/trips/${id}?token=${token}` 
                    : `/api/trips/view-by-token?token=${token}`;
                
                const res = await fetch(apiUrl);
                if (res.ok) {
                    const data = await res.json();
                    setTrip(data.trip);
                    setQuotes(data.quotes);
                    setLoading(false);
                    return;
                }
            } catch (err) {
                console.error('Token fetch failed:', err);
            }
        }

        setLoading(false);
    };

    useEffect(() => {
        if (!authLoading) fetchData();
    }, [id, authLoading, token]);

    const handleAcceptQuote = async (quoteId: string) => {
        if (!user && !token) {
            router.push(`/login?redirect=/trips/${trip?.id || id}`);
            return;
        }

        setAcceptingQuoteId(quoteId);
        try {
            const response = await fetch('/api/quotes/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quoteId,
                    tripRequestId: trip?.id || id,
                    userId: user?.id,
                    token
                })
            });

            if (!response.ok) {
                const error = await response.json();
                logClientError("Quote Acceptance Failed", { quoteId, error: error.error });
                alert(error.error || 'Failed to accept quote');
            } else {
                await fetchData();
                alert('Quote accepted successfully!');
            }
        } catch (error: any) {
            console.error('Error accepting quote:', error);
            alert('Error accepting quote. Please try again.');
        } finally {
            setAcceptingQuoteId(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-neutral-50">
                <Navbar />
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
                </div>
            </div>
        );
    }

    if (!trip) {
        return (
            <div className="min-h-screen bg-neutral-50">
                <Navbar />
                <div className="container mx-auto max-w-7xl px-6 py-24 text-center">
                    <h2 className="text-2xl font-bold">Trip not found</h2>
                    <p className="text-neutral-500 mt-2">We couldn't find the trip details. Please check your link.</p>
                    <Link href="/">
                        <Button variant="outline" className="mt-8">Go to Homepage</Button>
                    </Link>
                </div>
            </div>
        );
    }

    const getServiceIcon = (serviceType: string) => {
        switch (serviceType) {
            case 'school': return <Bus className="h-6 w-6" />;
            case 'medical': return <Heart className="h-6 w-6" />;
            case 'wedding': return <Plane className="h-6 w-6" />;
            default: return <Bus className="h-6 w-6" />;
        }
    };

    return (
        <div className="min-h-screen bg-neutral-50 pb-20">
            <Navbar />
            <div className="container mx-auto max-w-4xl px-4 sm:px-6 pt-24">
                <Link href="/trips" className="flex items-center gap-2 text-neutral-500 hover:text-neutral-900 mb-6">
                    <ChevronLeft className="h-4 w-4" />
                    <span>Back to Trips</span>
                </Link>

                <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-neutral-100 mb-8">
                    <div className="flex flex-col md:flex-row justify-between gap-6">
                        <div className="flex items-start gap-4">
                            <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center",
                                trip.service_type === 'school' && "bg-amber-100 text-amber-600",
                                trip.service_type === 'medical' && "bg-green-100 text-green-600",
                                trip.service_type === 'wedding' && "bg-indigo-100 text-indigo-600"
                            )}>
                                {getServiceIcon(trip.service_type)}
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-neutral-900 capitalize">{trip.service_type} Trip</h1>
                                <Badge className={cn(trip.status === 'booked' ? "bg-green-500" : "bg-blue-500")}>
                                    {trip.status.toUpperCase()}
                                </Badge>
                                <p className="text-sm text-neutral-500 font-mono mt-1">#{trip.id.slice(0, 8)}</p>
                            </div>
                        </div>
                        <div className="text-sm text-neutral-600 space-y-1">
                            <div className="flex items-center gap-2"><Calendar className="h-4 w-4" /> {new Date(trip.start_date).toLocaleDateString()}</div>
                            <div className="flex items-center gap-2"><Clock className="h-4 w-4" /> {trip.start_time?.slice(0, 5) || 'TBA'}</div>
                        </div>
                    </div>
                </div>

                <div className="mb-8">
                    <h2 className="text-xl font-bold text-neutral-900 mb-6">Quotes ({quotes.length})</h2>
                    {quotes.length === 0 ? (
                        <Card className="p-12 text-center bg-white border-dashed border-2 border-neutral-200 shadow-none">
                            <RefreshCw className="h-10 w-10 text-neutral-300 mx-auto mb-4 animate-spin-slow" />
                            <h3 className="text-lg font-semibold text-neutral-900">Waiting for operators...</h3>
                        </Card>
                    ) : (
                        <div className="space-y-6">
                            {quotes.map((quote, index) => (
                                <QuoteCard
                                    key={quote.id}
                                    quote={{
                                        id: quote.id,
                                        tripRequestId: trip.id,
                                        operatorId: quote.operator_id,
                                        totalPrice: quote.total_price,
                                        baseFare: (quote as any).base_fare || quote.total_price,
                                        distanceCharge: (quote as any).distance_charge || 0,
                                        additionalFees: (quote as any).additional_fees || [],
                                        vehicleType: quote.vehicle_type,
                                        vehicleYear: (quote as any).vehicle_year || 2023,
                                        vehicleCapacity: (quote as any).vehicle_capacity || 14,
                                        operatorName: quote.operator?.company_name || 'Anonymous Operator',
                                        operatorAvatar: quote.operator?.profile?.avatar_url || '',
                                        operatorPhone: quote.operator?.company_phone,
                                        operatorEmail: quote.operator?.company_email,
                                        operatorRating: quote.operator?.rating || 4.8,
                                        operatorReviewCount: quote.operator?.total_reviews || 0,
                                        responseTime: 15,
                                        status: quote.status as any,
                                        isLowestPrice: index === 0,
                                        isHighestRated: false,
                                        coriCertified: true,
                                        insuranceVerified: true,
                                        wheelchairAccessible: false,
                                        operatorNote: quote.note,
                                        createdAt: new Date(quote.created_at),
                                        expiresAt: new Date()
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

export default function TripViewPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-neutral-50" />}>
            <TripViewContent />
        </Suspense>
    );
}
