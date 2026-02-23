"use client";

import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Bus, HeartPulse, Gem, Clock, MapPin, ChevronRight, CheckCircle2, Package, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { QuoteComparison } from "@/components/quote-comparison";
import { TripRequest, Quote } from "@/types/quotes";
import { useNotifications } from "@/hooks/use-notifications";
import { useTransportRequests, TransportRequest as ApiRequest } from "@/hooks/use-transport-requests";

export function TripsSidebar({ children }: { children?: React.ReactNode }) {
    const { requests: apiRequests, loading: isLoadingRequests } = useTransportRequests();
    const [trips, setTrips] = useState<TripRequest[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedTrip, setSelectedTrip] = useState<TripRequest | null>(null);
    const { addNotification } = useNotifications();

    useEffect(() => {
        if (!apiRequests) return;

        // Map API objects to UI objects
        const mappedTrips = apiRequests.map((trip: any) => {
            let pickup_fuzzy_location = trip.pickup_fuzzy || trip.pickup_address || 'Pickup';
            let dropoff_fuzzy_location = trip.dropoff_fuzzy || trip.dropoff_address || 'Destination';

            return {
                ...trip,
                pickup_fuzzy_location,
                dropoff_fuzzy_location,
                distance: trip.distance || 4.2,
                duration: trip.duration || 18,
                quotes: trip.quotes || generateMockQuotes(trip)
            } as unknown as TripRequest;
        });

        setTrips(mappedTrips);
    }, [apiRequests]);

    const generateMockQuotes = (trip: any): Quote[] => {
        const operators = [
            { name: "Alpha Transit", rating: 4.8, reviews: 124, avatar: undefined },
            { name: "Boston Coach", rating: 4.9, reviews: 98, avatar: undefined },
            { name: "SafeWay Vans", rating: 5.0, reviews: 67, avatar: undefined },
            { name: "Legacy Limo", rating: 4.7, reviews: 156, avatar: undefined },
            { name: "Elite Transport", rating: 4.6, reviews: 89, avatar: undefined },
        ];

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now

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
                operatorAvatar: op.avatar,
                totalPrice,
                baseFare: Math.round(baseFare),
                distanceCharge: Math.round(distanceCharge),
                additionalFees,
                vehicleType: idx === 0 ? "Mercedes Sprinter" : idx === 1 ? "Ford Transit" : idx === 2 ? "Dodge Grand Caravan" : idx === 3 ? "Lincoln Navigator" : "Chevrolet Suburban",
                vehicleYear: 2020 + idx,
                vehicleCapacity: 12 + idx * 2,
                vehiclePhoto: undefined,
                coriCertified: true,
                insuranceVerified: true,
                wheelchairAccessible: idx < 3,
                operatorNote: idx === 0 ? "I have 3 other pickups nearby - can offer 10% discount if flexible on time" : undefined,
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

    const handleAcceptQuote = async (quoteId: string) => {
        if (!selectedTrip) return;

        // Update quote status
        const updatedTrips = trips.map(trip => {
            if (trip.id === selectedTrip.id) {
                return {
                    ...trip,
                    status: 'accepted' as const,
                    quotes: trip.quotes?.map(q => ({
                        ...q,
                        status: q.id === quoteId ? 'accepted' as const : 'declined' as const
                    }))
                };
            }
            return trip;
        });

        setTrips(updatedTrips);
        setSelectedTrip(updatedTrips.find(t => t.id === selectedTrip.id) || null);

        const acceptedQuote = selectedTrip.quotes?.find(q => q.id === quoteId);

        addNotification({
            title: "Quote Accepted!",
            message: `You've accepted ${acceptedQuote?.operatorName}'s quote for $${acceptedQuote?.totalPrice}`,
            type: "success"
        });
    };

    const handleDeclineQuote = async (quoteId: string) => {
        if (!selectedTrip) return;

        const updatedTrips = trips.map(trip => {
            if (trip.id === selectedTrip.id) {
                return {
                    ...trip,
                    quotes: trip.quotes?.map(q => ({
                        ...q,
                        status: q.id === quoteId ? 'declined' as const : q.status
                    }))
                };
            }
            return trip;
        });

        setTrips(updatedTrips);
        setSelectedTrip(updatedTrips.find(t => t.id === selectedTrip.id) || null);

        addNotification({
            title: "Quote Declined",
            message: "The operator has been notified",
            type: "info"
        });
    };

    const handleMessageOperator = async (quoteId: string) => {
        addNotification({
            title: "Message Feature",
            message: "Direct messaging will be available soon!",
            type: "info"
        });
    };

    useEffect(() => {
        const handleOpenSidebar = () => setIsOpen(true);
        window.addEventListener('open-trips-sidebar', handleOpenSidebar);
        return () => {
            window.removeEventListener('open-trips-sidebar', handleOpenSidebar);
        };
    }, []);

    const getIcon = (type: string) => {
        switch (type) {
            case 'school': return Bus;
            case 'medical': return HeartPulse;
            case 'wedding': return Gem;
            default: return Package;
        }
    };

    const getColorClass = (type: string) => {
        switch (type) {
            case 'school': return "text-amber-500 bg-amber-50";
            case 'medical': return "text-green-500 bg-green-50";
            case 'wedding': return "text-indigo-500 bg-indigo-50";
            default: return "text-neutral-500 bg-neutral-50";
        }
    };

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
                {children || (
                    <button className="fixed bottom-8 right-8 z-50 flex items-center gap-3 px-6 py-4 rounded-lg bg-black text-white shadow-sm transition-colors duration-150 group overflow-hidden">
                        <Package className="w-5 h-5 text-indigo-400" />
                        <div className="flex flex-col items-start leading-none">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">Active Requests</span>
                            <span className="text-sm font-semibold">{trips.length} Projects</span>
                        </div>
                        {trips.length > 0 && (
                            <div className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-semibold">
                                {trips.length}
                            </div>
                        )}
                    </button>
                )}
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md p-0 border-l-0 bg-neutral-50 flex flex-col h-full overflow-hidden">
                {selectedTrip ? (
                    <>
                        <SheetTitle className="sr-only">Quote Comparison</SheetTitle>
                        <QuoteComparison
                            tripRequest={selectedTrip}
                            onBack={() => setSelectedTrip(null)}
                            onAcceptQuote={handleAcceptQuote}
                            onDeclineQuote={handleDeclineQuote}
                            onMessageOperator={handleMessageOperator}
                        />
                    </>
                ) : (
                    <>
                        <div className="p-8 bg-white border-b">
                            <SheetHeader className="space-y-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 rounded-md bg-indigo-600 text-white">
                                        <History className="w-4 h-4" />
                                    </div>
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-600">Command Center</span>
                                </div>
                                <SheetTitle className="text-3xl font-semibold tracking-tight">Your Network Activity</SheetTitle>
                                <SheetDescription>
                                    Real-time tracking of your private transport requests.
                                </SheetDescription>
                            </SheetHeader>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                            {trips.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40 grayscale">
                                    <Package className="w-16 h-16" />
                                    <p className="font-bold">No active requests found.</p>
                                </div>
                            ) : (
                                <AnimatePresence mode="popLayout">
                                    {trips.map((trip, idx) => {
                                        const Icon = getIcon(trip.service_type);
                                        return (
                                            <motion.div
                                                key={trip.id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: idx * 0.05 }}
                                                onClick={() => setSelectedTrip(trip)}
                                                className="bg-white rounded-lg p-6 shadow-sm border border-neutral-100 hover:shadow-md transition-shadow duration-150 group relative overflow-hidden cursor-pointer"
                                            >
                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn("p-3 rounded-lg", getColorClass(trip.service_type))}>
                                                            <Icon className="w-5 h-5" />
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                                                                {trip.service_type === 'school' ? 'School Run' : trip.service_type === 'medical' ? 'Care Ride' : 'Event Shuttle'}
                                                            </div>
                                                            <div className="text-sm font-semibold text-neutral-900">
                                                                {trip.created_at ? new Date(trip.created_at).toLocaleDateString() : 'Just now'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="px-3 py-1 rounded-full bg-green-50 text-[10px] font-semibold text-green-600 uppercase tracking-widest border border-green-100 flex items-center gap-1.5">
                                                        <span className="w-1 h-1 rounded-full bg-green-500" />
                                                        Live Bidding
                                                    </div>
                                                </div>

                                                <div className="relative pl-2">
                                                    {/* Connecting line */}
                                                    <div className="absolute left-[5px] top-[8px] bottom-[8px] w-[2px] bg-gradient-to-b from-neutral-300 to-indigo-500 rounded-full" />

                                                    <div className="space-y-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="relative z-10 w-3 h-3 rounded-full bg-neutral-400 border-2 border-white shadow-sm flex-shrink-0" />
                                                            <div className="text-xs font-semibold text-neutral-500 truncate">
                                                                {trip.pickup_fuzzy_location || 'Pickup Location'}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <div className="relative z-10 w-3 h-3 rounded-full bg-indigo-600 border-2 border-white shadow-sm flex-shrink-0" />
                                                            <div className="text-xs font-bold text-neutral-900 truncate">
                                                                {trip.dropoff_fuzzy_location || 'Destination'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-6 pt-4 border-t border-neutral-50 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex -space-x-2">
                                                            {(trip.quotes || []).slice(0, 3).map((_, i) => (
                                                                <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                                                                    <CheckCircle2 className="w-3 h-3 text-white" />
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">
                                                            {(trip.quotes || []).length} Quote{(trip.quotes || []).length !== 1 ? 's' : ''} Received
                                                        </span>
                                                    </div>
                                                    <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-indigo-500 transition-colors duration-150" />
                                                </div>

                                                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                                    <div className="px-2 py-1 rounded-md bg-neutral-950 text-white text-[9px] font-semibold uppercase tracking-tighter shadow-sm">
                                                        View Project
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            )}
                        </div>

                        <div className="p-8 bg-white border-t space-y-4">
                            <div className="flex items-center justify-between text-sm font-semibold">
                                <span className="text-neutral-500">Total Requests Sent</span>
                                <span className="text-neutral-900">{trips.length}</span>
                            </div>
                            <Button className="w-full h-10 rounded-md bg-black text-white font-semibold tracking-tight shadow-sm transition-colors duration-150">
                                Upgrade For Group Discounts
                            </Button>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
