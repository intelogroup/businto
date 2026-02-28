"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

interface Quote {
    id: string;
    total_price: number;
    vehicle_type: string;
    note: string;
    status: string;
    operator_id: string;
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

export default function TripDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const [trip, setTrip] = useState<TransportRequest | null>(null);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [loading, setLoading] = useState(true);
    const [acceptingQuoteId, setAcceptingQuoteId] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        const supabase = createClient();
        try {
            // Fetch trip details
            const { data: tripData, error: tripError } = await supabase
                .from('transport_requests')
                .select('*')
                .eq('id', id)
                .single();

            if (tripError) throw tripError;
            setTrip(tripData);

            // Fetch quotes
            const { data: quotesData, error: quotesError } = await supabase
                .from('quotes')
                .select(`
          *,
          operator:profiles!quotes_operator_id_fkey (
            company_name,
            full_name,
            avatar_url,
            phone,
            email
          )
        `)
                .eq('request_id', id)
                .order('total_price', { ascending: true });

            if (quotesError) throw quotesError;
            setQuotes(quotesData || []);
        } catch (error) {
            console.error('Error fetching trip details:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) fetchData();
    }, [id]);

    const handleAcceptQuote = async (quoteId: string) => {
        if (!user) {
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
                    userId: user.id
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to accept quote');
            }

            // Success! Refresh data
            await fetchData();
            alert('Quote accepted successfully!');
        } catch (error: any) {
            console.error('Error accepting quote:', error);
            alert(error.message || 'Error accepting quote. Please try again.');
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
                    <Link href="/trips" className="text-blue-600 hover:underline mt-4 inline-block">
                        Back to your trips
                    </Link>
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
        <div className="min-h-screen bg-neutral-50 pb-20">
            <Navbar />

            <div className="container mx-auto max-w-4xl px-4 sm:px-6 pt-24">
                <Link href="/trips" className="flex items-center gap-2 text-neutral-500 hover:text-neutral-900 mb-6 transition-colors">
                    <ChevronLeft className="h-4 w-4" />
                    <span>Back to Trips</span>
                </Link>

                {/* Trip Header */}
                <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-neutral-100 mb-8">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
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
                                <div className="flex items-center gap-2 mb-1">
                                    <h1 className="text-2xl font-bold text-neutral-900">
                                        {trip.service_type.charAt(0).toUpperCase() + trip.service_type.slice(1)} Trip
                                    </h1>
                                    <Badge className={cn(
                                        trip.status === 'booked' || trip.status === 'quote_accepted' ? "bg-green-500" : "bg-blue-500"
                                    )}>
                                        {trip.status === 'quote_accepted' ? 'Booked' : trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
                                    </Badge>
                                </div>
                                <p className="text-sm text-neutral-500 font-mono">Request #{trip.id.slice(0, 8)}</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2 text-sm text-neutral-600">
                                <Calendar className="h-4 w-4" />
                                <span>{new Date(trip.start_date).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-neutral-600">
                                <Clock className="h-4 w-4" />
                                <span>{trip.start_time?.slice(0, 5) || 'TBA'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8 pt-8 border-t border-neutral-100">
                        <div>
                            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4">Route Details</h3>
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                                    <div>
                                        <p className="text-xs text-neutral-400">Pickup</p>
                                        <p className="text-sm font-medium text-neutral-900 leading-relaxed">{trip.pickup_address}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5" />
                                    <div>
                                        <p className="text-xs text-neutral-400">Drop-off</p>
                                        <p className="text-sm font-medium text-neutral-900 leading-relaxed">{trip.dropoff_address}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4">Requirements</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {Object.entries(trip.metadata_safe || {}).map(([key, value]) => {
                                    if (typeof value === 'boolean' && value) {
                                        return (
                                            <div key={key} className="flex items-center gap-2 text-sm text-neutral-700">
                                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                                            </div>
                                        );
                                    }
                                    if (typeof value === 'string' || typeof value === 'number') {
                                        return (
                                            <div key={key} className="text-sm">
                                                <span className="text-neutral-400 block text-[10px] uppercase font-bold">{key.replace(/_/g, ' ')}</span>
                                                <span className="text-neutral-900 font-medium capitalize">{value}</span>
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
                        <h2 className="text-xl font-bold text-neutral-900">
                            Quotes {quotes.length > 0 && `(${quotes.length})`}
                        </h2>
                    </div>

                    {quotes.length === 0 ? (
                        <Card className="p-12 text-center bg-white border-dashed border-2 border-neutral-200 shadow-none">
                            <RefreshCw className="h-10 w-10 text-neutral-300 mx-auto mb-4 animate-spin-slow" />
                            <h3 className="text-lg font-semibold text-neutral-900">Waiting for operators...</h3>
                            <p className="text-sm text-neutral-500 mt-1">Quotes usually arrive within 15-60 minutes.</p>
                        </Card>
                    ) : (
                        <div className="space-y-6">
                            {quotes.map((quote, index) => (
                                <QuoteCard
                                    key={quote.id}
                                    quote={{
                                        id: quote.id,
                                        tripRequestId: id as string,
                                        operatorId: quote.operator_id,
                                        totalPrice: quote.total_price,
                                        baseFare: quote.total_price * 0.8, // Approximation
                                        distanceCharge: quote.total_price * 0.2, // Approximation
                                        additionalFees: [],
                                        vehicleType: quote.vehicle_type,
                                        vehicleYear: 2023,
                                        vehicleCapacity: 14,
                                        operatorName: quote.operator?.company_name || quote.operator?.full_name || 'Anonymous Operator',
                                        operatorAvatar: quote.operator?.avatar_url || '',
                                        operatorPhone: (quote.operator as any)?.phone || undefined,
                                        operatorEmail: (quote.operator as any)?.email || undefined,
                                        operatorRating: 4.8,
                                        operatorReviewCount: 12,
                                        responseTime: 15,
                                        status: quote.status as any,
                                        isLowestPrice: index === 0,
                                        isHighestRated: false,
                                        coriCertified: true,
                                        insuranceVerified: true,
                                        wheelchairAccessible: false,
                                        operatorNote: quote.note,
                                        createdAt: new Date(),
                                        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000)
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
