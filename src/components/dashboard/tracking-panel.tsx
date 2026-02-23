"use client";

import { useState, useEffect, useMemo } from "react";
import { TripRequest, Quote, QuoteSortOption } from "@/types/quotes";
import { QuoteCardCompact } from "@/components/quote-card-compact";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, TrendingUp, Star, DollarSign, Zap, Bus, HeartPulse, Gem, Package } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/use-notifications";
import { useTransportRequests, TransportRequest as DBTransportRequest } from "@/hooks/use-transport-requests";

export function TrackingPanel() {
    const [trips, setTrips] = useState<TripRequest[]>([]);
    const [selectedTrip, setSelectedTrip] = useState<TripRequest | null>(null);
    const [sortBy, setSortBy] = useState<QuoteSortOption>('price-low');
    const [timeRemaining, setTimeRemaining] = useState<string>('');
    const { addNotification } = useNotifications();

    const loadTrips = () => {
        const stored = localStorage.getItem('transport_requests');
        if (stored) {
            const parsedTrips = JSON.parse(stored);
            const tripsWithQuotes = parsedTrips.map((trip: any) => {
                let pickup_fuzzy_location = '';
                let dropoff_fuzzy_location = '';

                if (trip.service_type === 'school') {
                    pickup_fuzzy_location = trip.pickup_address || 'Home Address';
                    dropoff_fuzzy_location = trip.school_name || 'School';
                } else if (trip.service_type === 'medical') {
                    pickup_fuzzy_location = trip.pickup_location || 'Pickup Location';
                    dropoff_fuzzy_location = trip.dropoff_location || 'Medical Facility';
                } else if (trip.service_type === 'wedding') {
                    pickup_fuzzy_location = trip.hotel_zip ? `Hotel (${trip.hotel_zip})` : 'Hotel';
                    dropoff_fuzzy_location = trip.venue_zip ? `Venue (${trip.venue_zip})` : 'Venue';
                }

                return {
                    ...trip,
                    pickup_fuzzy_location,
                    dropoff_fuzzy_location,
                    distance: trip.distance || 4.2,
                    duration: trip.duration || 18,
                    quotes: generateMockQuotes(trip)
                };
            });
            setTrips(tripsWithQuotes);
            if (tripsWithQuotes.length > 0 && !selectedTrip) {
                setSelectedTrip(tripsWithQuotes[0]);
            }
        }
    };

    const generateMockQuotes = (trip: any): Quote[] => {
        const operators = [
            { name: "Alpha Transit", rating: 4.8, reviews: 124 },
            { name: "Boston Coach", rating: 4.9, reviews: 98 },
            { name: "SafeWay Vans", rating: 5.0, reviews: 67 },
            { name: "Legacy Limo", rating: 4.7, reviews: 156 },
            { name: "Elite Transport", rating: 4.6, reviews: 89 },
        ];

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

        return operators.map((op, idx) => {
            const baseFare = 45 + Math.random() * 15;
            const distanceCharge = (trip.distance || 4.2) * (2 + Math.random() * 1.5);
            const additionalFees = idx === 0 ? [{ name: "Monitor fee", amount: 8 }] : [];
            const totalFees = additionalFees.reduce((sum, fee) => sum + fee.amount, 0);
            const totalPrice = Math.round(baseFare + distanceCharge + totalFees);

            return {
                id: `quote-${trip.id}-${idx}`,
                tripRequestId: trip.id,
                operatorId: `op-${idx}`,
                operatorName: op.name,
                operatorRating: op.rating,
                operatorReviewCount: op.reviews,
                operatorAvatar: undefined,
                totalPrice,
                baseFare: Math.round(baseFare),
                distanceCharge: Math.round(distanceCharge),
                additionalFees,
                vehicleType: idx === 0 ? "Mercedes Sprinter" : idx === 1 ? "Ford Transit" : idx === 2 ? "Dodge Caravan" : idx === 3 ? "Lincoln Navigator" : "Chevy Suburban",
                vehicleYear: 2020 + idx,
                vehicleCapacity: 12 + idx * 2,
                vehiclePhoto: undefined,
                coriCertified: true,
                insuranceVerified: true,
                wheelchairAccessible: idx < 3,
                operatorNote: idx === 0 ? "10% discount if flexible on time" : undefined,
                responseTime: 3 + idx * 2,
                status: 'pending',
                createdAt: new Date(now.getTime() - (5 - idx) * 60 * 1000),
                expiresAt,
                isLowestPrice: undefined,
                isHighestRated: undefined,
                discount: idx === 1 ? { percentage: 10, reason: "First-time customer" } : undefined,
            } as Quote;
        }).map((quote, _, allQuotes) => {
            const prices = allQuotes.map(q => q.totalPrice);
            const ratings = allQuotes.map(q => q.operatorRating);
            return {
                ...quote,
                isLowestPrice: quote.totalPrice === Math.min(...prices),
                isHighestRated: quote.operatorRating === Math.max(...ratings),
            };
        });
    };

    useEffect(() => {
        loadTrips();
        const handleNewRequest = () => loadTrips();
        window.addEventListener('new-transport-request', handleNewRequest);
        return () => window.removeEventListener('new-transport-request', handleNewRequest);
    }, []);

    useEffect(() => {
        if (!selectedTrip?.quotes?.length) return;
        const updateTimer = () => {
            const firstQuote = selectedTrip.quotes![0];
            const expiresAt = new Date(firstQuote.expiresAt).getTime();
            const now = Date.now();
            const diff = expiresAt - now;
            if (diff <= 0) { setTimeRemaining('Expired'); return; }
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            setTimeRemaining(`${hours}h ${minutes}m`);
        };
        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [selectedTrip]);

    const sortedQuotes = useMemo(() => {
        if (!selectedTrip?.quotes) return [];
        const sorted = [...selectedTrip.quotes];
        switch (sortBy) {
            case 'price-low': sorted.sort((a, b) => a.totalPrice - b.totalPrice); break;
            case 'price-high': sorted.sort((a, b) => b.totalPrice - a.totalPrice); break;
            case 'rating': sorted.sort((a, b) => b.operatorRating - a.operatorRating); break;
            case 'response-time': sorted.sort((a, b) => a.responseTime - b.responseTime); break;
        }
        return sorted;
    }, [selectedTrip?.quotes, sortBy]);

    const stats = useMemo(() => {
        if (!selectedTrip?.quotes?.length) return null;
        const prices = selectedTrip.quotes.map(q => q.totalPrice);
        return { count: selectedTrip.quotes.length, minPrice: Math.min(...prices) };
    }, [selectedTrip?.quotes]);

    const handleAcceptQuote = (quoteId: string) => {
        if (!selectedTrip) return;
        const updatedTrips = trips.map(trip => {
            if (trip.id === selectedTrip.id) {
                return {
                    ...trip, status: 'accepted' as const,
                    quotes: trip.quotes?.map(q => ({ ...q, status: q.id === quoteId ? 'accepted' as const : 'declined' as const }))
                };
            }
            return trip;
        });
        setTrips(updatedTrips);
        setSelectedTrip(updatedTrips.find(t => t.id === selectedTrip.id) || null);
        const acceptedQuote = selectedTrip.quotes?.find(q => q.id === quoteId);
        addNotification({ title: "Quote Accepted!", message: `${acceptedQuote?.operatorName} - $${acceptedQuote?.totalPrice}`, type: "success" });
    };

    const handleDeclineQuote = (quoteId: string) => {
        if (!selectedTrip) return;
        const updatedTrips = trips.map(trip => {
            if (trip.id === selectedTrip.id) {
                return { ...trip, quotes: trip.quotes?.map(q => ({ ...q, status: q.id === quoteId ? 'declined' as const : q.status })) };
            }
            return trip;
        });
        setTrips(updatedTrips);
        setSelectedTrip(updatedTrips.find(t => t.id === selectedTrip.id) || null);
        addNotification({ title: "Quote Declined", message: "Operator notified", type: "info" });
    };

    const handleMessageOperator = () => {
        addNotification({ title: "Message Feature", message: "Coming soon!", type: "info" });
    };

    const getIcon = (type: string) => {
        switch (type) { case 'school': return Bus; case 'medical': return HeartPulse; case 'wedding': return Gem; default: return Package; }
    };

    const getColorClass = (type: string) => {
        switch (type) { case 'school': return "text-amber-500 bg-amber-50"; case 'medical': return "text-sky-500 bg-sky-50"; case 'wedding': return "text-indigo-500 bg-indigo-50"; default: return "text-neutral-500 bg-neutral-50"; }
    };

    if (trips.length === 0) return null;

    return (
        <div className="mt-8">
            {/* Compact Header Row */}
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-neutral-900">Active Requests</h2>
                    {stats && (
                        <Badge variant="outline" className="text-green-700 border-green-200">
                            Best: ${stats.minPrice}
                        </Badge>
                    )}
                    {timeRemaining && timeRemaining !== 'Expired' && (
                        <Badge variant="outline" className="text-red-600 border-red-200">
                            <Clock className="w-3 h-3 mr-1" />{timeRemaining}
                        </Badge>
                    )}
                </div>

                <Select value={sortBy} onValueChange={(v) => setSortBy(v as QuoteSortOption)}>
                    <SelectTrigger className="w-[160px] h-8 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="price-low"><span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />Price: Low-High</span></SelectItem>
                        <SelectItem value="price-high"><span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />Price: High-Low</span></SelectItem>
                        <SelectItem value="rating"><span className="flex items-center gap-1"><Star className="w-3 h-3" />Top Rated</span></SelectItem>
                        <SelectItem value="response-time"><span className="flex items-center gap-1"><Zap className="w-3 h-3" />Fastest</span></SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Trip Tabs - Compact */}
            {trips.length > 1 && (
                <div className="flex gap-2 mb-4 overflow-x-auto">
                    {trips.map((trip) => {
                        const Icon = getIcon(trip.service_type);
                        const isSelected = selectedTrip?.id === trip.id;
                        return (
                            <button
                                key={trip.id}
                                onClick={() => setSelectedTrip(trip)}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                                    isSelected ? "bg-indigo-100 text-indigo-700" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                                )}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {(trip.quotes || []).length} quotes
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Route Info - Compact Inline */}
            {selectedTrip && (
                <div className="flex items-center gap-2 text-xs text-neutral-500 mb-4">
                    <span className="font-medium text-neutral-700">{selectedTrip.pickup_fuzzy_location}</span>
                    <span className="text-neutral-300">→</span>
                    <span className="font-semibold text-neutral-900">{selectedTrip.dropoff_fuzzy_location}</span>
                </div>
            )}

            {/* Quotes Grid - responsive columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <AnimatePresence mode="popLayout">
                    {sortedQuotes.map((quote, idx) => (
                        <motion.div
                            key={quote.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.03 }}
                        >
                            <QuoteCardCompact
                                quote={quote}
                                onAccept={handleAcceptQuote}
                                onDecline={handleDeclineQuote}
                                onMessage={handleMessageOperator}
                            />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}
