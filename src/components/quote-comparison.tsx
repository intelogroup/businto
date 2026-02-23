"use client";

import { useState, useMemo, useEffect } from "react";
import { Quote, QuoteSortOption, TripRequest } from "@/types/quotes";
import { QuoteCard } from "@/components/quote-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, MapPin, ArrowRight, ChevronLeft, TrendingUp, Star, DollarSign, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface QuoteComparisonProps {
  tripRequest: TripRequest;
  onBack: () => void;
  onAcceptQuote: (quoteId: string) => void;
  onDeclineQuote: (quoteId: string) => void;
  onMessageOperator: (quoteId: string) => void;
}

export function QuoteComparison({
  tripRequest,
  onBack,
  onAcceptQuote,
  onDeclineQuote,
  onMessageOperator
}: QuoteComparisonProps) {
  const [sortBy, setSortBy] = useState<QuoteSortOption>('price-low');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [showPolicyBanner, setShowPolicyBanner] = useState(true);

  const quotes = tripRequest.quotes || [];

  // Calculate time remaining until quotes expire
  useEffect(() => {
    if (quotes.length === 0) return;

    const updateTimer = () => {
      const firstQuote = quotes[0];
      const expiresAt = new Date(firstQuote.expiresAt).getTime();
      const now = Date.now();
      const diff = expiresAt - now;

      if (diff <= 0) {
        setTimeRemaining('Expired');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [quotes]);

  // Sort quotes
  const sortedQuotes = useMemo(() => {
    const sorted = [...quotes];

    switch (sortBy) {
      case 'price-low':
        sorted.sort((a, b) => a.totalPrice - b.totalPrice);
        break;
      case 'price-high':
        sorted.sort((a, b) => b.totalPrice - a.totalPrice);
        break;
      case 'rating':
        sorted.sort((a, b) => b.operatorRating - a.operatorRating);
        break;
      case 'response-time':
        sorted.sort((a, b) => a.responseTime - b.responseTime);
        break;
    }

    return sorted;
  }, [quotes, sortBy]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (quotes.length === 0) return null;

    const prices = quotes.map(q => q.totalPrice);
    const avgResponse = quotes.reduce((sum, q) => sum + q.responseTime, 0) / quotes.length;

    return {
      count: quotes.length,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      avgResponse: Math.round(avgResponse),
    };
  }, [quotes]);

  if (quotes.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-6 border-b bg-white">
          <Button
            variant="ghost"
            className="mb-4 -ml-2"
            onClick={onBack}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Trips
          </Button>
          <h2 className="text-2xl font-black">Waiting for Quotes...</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 opacity-40">
            <Clock className="w-16 h-16 mx-auto animate-pulse" />
            <p className="font-bold text-neutral-600">No quotes received yet</p>
            <p className="text-sm text-neutral-500">Operators typically respond within 15 minutes</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-neutral-50 overflow-hidden">
      {/* Header */}
      <div className="p-6 bg-white border-b space-y-4">
        <Button
          variant="ghost"
          className="-ml-2"
          onClick={onBack}
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back to Trips
        </Button>

        {/* Trip Summary */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-green-600 text-white animate-pulse">
              {quotes.length} Quote{quotes.length !== 1 ? 's' : ''} Received
            </Badge>
            {timeRemaining !== 'Expired' && (
              <Badge variant="outline" className="border-red-200 text-red-600">
                <Clock className="w-3 h-3 mr-1" />
                Expires in {timeRemaining}
              </Badge>
            )}
          </div>
          <h2 className="text-2xl font-black text-neutral-900 mb-2">
            {tripRequest.service_type === 'school' ? 'School Run' :
             tripRequest.service_type === 'medical' ? 'Care Ride' :
             tripRequest.service_type === 'wedding' ? 'Event Shuttle' : 'Trip'}
          </h2>
          <div className="relative pl-2 mt-4 mb-2">
            {/* Connecting line */}
            <div className="absolute left-[5px] top-[8px] bottom-[8px] w-[2px] bg-gradient-to-b from-neutral-300 to-indigo-500 rounded-full" />

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative z-10 w-3 h-3 rounded-full bg-neutral-400 border-2 border-white shadow-sm flex-shrink-0" />
                <span className="text-sm font-medium text-neutral-600">
                  {tripRequest.pickup_fuzzy_location || 'Pickup Location'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative z-10 w-3 h-3 rounded-full bg-indigo-600 border-2 border-white shadow-sm flex-shrink-0" />
                <span className="text-sm font-bold text-neutral-900">
                  {tripRequest.dropoff_fuzzy_location || 'Destination'}
                </span>
              </div>
            </div>
          </div>
          {tripRequest.distance && (
            <div className="text-sm text-neutral-500 pl-2">
              {tripRequest.distance.toFixed(1)} miles • ~{tripRequest.duration} min
            </div>
          )}
        </div>

        {/* MARKETPLACE INTEGRITY: Acceptance Policy Banner */}
        {showPolicyBanner && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 relative">
            <button
              onClick={() => setShowPolicyBanner(false)}
              className="absolute top-2 right-2 text-blue-400 hover:text-blue-600 text-xs"
            >
              ✕
            </button>
            <div className="flex gap-3">
              <div className="text-blue-600 text-xl flex-shrink-0">ℹ️</div>
              <div>
                <p className="text-sm font-bold text-blue-900 mb-1">Acceptance is Final</p>
                <p className="text-xs text-blue-800">
                  Once you accept a quote, your decision is <strong>final</strong>. All other quotes will close permanently. 
                  To choose a different operator, you'll need to create a new request.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-3 border border-indigo-100">
              <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">
                Quotes
              </div>
              <div className="text-2xl font-black text-indigo-900">{stats.count}</div>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-3 border border-green-100">
              <div className="text-xs font-bold text-green-600 uppercase tracking-wider mb-1">
                Best Price
              </div>
              <div className="text-2xl font-black text-green-900">${stats.minPrice}</div>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-3 border border-amber-100">
              <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">
                Avg Response
              </div>
              <div className="text-2xl font-black text-amber-900">{stats.avgResponse}m</div>
            </div>
          </div>
        )}

        {/* Sort Controls */}
        <div className="flex items-center justify-between gap-4">
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as QuoteSortOption)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="price-low">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Price: Low to High
                </div>
              </SelectItem>
              <SelectItem value="price-high">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Price: High to Low
                </div>
              </SelectItem>
              <SelectItem value="rating">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4" />
                  Highest Rated
                </div>
              </SelectItem>
              <SelectItem value="response-time">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Fastest Response
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'cards' | 'table')}>
            <TabsList>
              <TabsTrigger value="cards">Cards</TabsTrigger>
              <TabsTrigger value="table">Table</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Quote List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
          {viewMode === 'cards' ? (
            <AnimatePresence mode="popLayout">
              {sortedQuotes.map((quote, idx) => (
                <motion.div
                  key={quote.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <QuoteCard
                    quote={quote}
                    onAccept={onAcceptQuote}
                    onDecline={onDeclineQuote}
                    onMessage={onMessageOperator}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          ) : (
            <QuoteTable
              quotes={sortedQuotes}
              onAccept={onAcceptQuote}
              onDecline={onDeclineQuote}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Table View Component
function QuoteTable({
  quotes,
  onAccept,
  onDecline
}: {
  quotes: Quote[];
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-neutral-50 border-b border-neutral-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-bold text-neutral-600 uppercase tracking-wider">
              Operator
            </th>
            <th className="px-4 py-3 text-left text-xs font-bold text-neutral-600 uppercase tracking-wider">
              Price
            </th>
            <th className="px-4 py-3 text-left text-xs font-bold text-neutral-600 uppercase tracking-wider">
              Rating
            </th>
            <th className="px-4 py-3 text-left text-xs font-bold text-neutral-600 uppercase tracking-wider">
              Vehicle
            </th>
            <th className="px-4 py-3 text-left text-xs font-bold text-neutral-600 uppercase tracking-wider">
              Response
            </th>
            <th className="px-4 py-3 text-right text-xs font-bold text-neutral-600 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {quotes.map((quote) => (
            <tr
              key={quote.id}
              className={cn(
                "hover:bg-neutral-50 transition-colors",
                quote.isLowestPrice && "bg-green-50"
              )}
            >
              <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="font-semibold text-neutral-900">{quote.operatorName}</div>
                  {quote.coriCertified && (
                    <Badge variant="outline" className="text-[10px] border-green-200 text-green-700">
                      CORI
                    </Badge>
                  )}
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="font-bold text-lg text-neutral-900">${quote.totalPrice}</div>
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className="font-semibold">{quote.operatorRating.toFixed(1)}</span>
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="text-sm text-neutral-700">{quote.vehicleType}</div>
                <div className="text-xs text-neutral-500">{quote.vehicleCapacity} seats</div>
              </td>
              <td className="px-4 py-4">
                <div className="text-sm text-neutral-700">{quote.responseTime} min</div>
              </td>
              <td className="px-4 py-4 text-right">
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700"
                    onClick={() => onAccept(quote.id)}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-neutral-500 hover:text-red-600"
                    onClick={() => onDecline(quote.id)}
                  >
                    Decline
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
