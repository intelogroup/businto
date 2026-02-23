"use client";

import { Quote } from "@/types/quotes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Star, CheckCircle2, Shield, MessageSquare, TrendingDown, Award } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuoteCardCompactProps {
    quote: Quote;
    onAccept: (quoteId: string) => void;
    onDecline: (quoteId: string) => void;
    onMessage: (quoteId: string) => void;
}

export function QuoteCardCompact({ quote, onAccept, onDecline, onMessage }: QuoteCardCompactProps) {
    const isAccepted = quote.status === 'accepted';
    const isDeclined = quote.status === 'declined';
    const isExpired = quote.status === 'expired';

    const handleAcceptClick = () => {
        // MARKETPLACE INTEGRITY: Clear warning before acceptance
        const confirmed = window.confirm(
            `⚠️ IMPORTANT: Once you accept this quote, your decision is FINAL.\n\n` +
            `✓ You will be locked to ${quote.operatorName}\n` +
            `✓ All other quotes will be permanently closed\n` +
            `✓ You cannot switch operators\n` +
            `✓ To choose a different operator, you must create a new request\n\n` +
            `Accept ${quote.operatorName}'s quote for $${quote.totalPrice}?`
        );

        if (confirmed) {
            onAccept(quote.id);
        }
    };

    return (
        <Card className={cn(
            "p-4 transition-all hover:shadow-md relative",
            quote.isLowestPrice && "border-green-500 border-2",
            quote.isHighestRated && !quote.isLowestPrice && "border-amber-500 border-2",
            isAccepted && "opacity-60",
            isDeclined && "hidden"
        )}>
            <div className="flex items-start justify-between gap-3">
                {/* Left: Operator Info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {quote.operatorName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                        <div className="font-semibold text-neutral-900 truncate">{quote.operatorName}</div>
                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                            <div className="flex items-center gap-1">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                <span className="font-medium">{quote.operatorRating.toFixed(1)}</span>
                            </div>
                            <span>•</span>
                            <span>{quote.vehicleType}</span>
                        </div>
                    </div>
                </div>

                {/* Right: Price & Badges */}
                <div className="text-right flex-shrink-0">
                    <div className="text-xl font-black text-neutral-900">${quote.totalPrice}</div>
                    <div className="flex gap-1 justify-end mt-1">
                        {quote.isLowestPrice && (
                            <Badge className="bg-green-600 text-white text-[9px] px-1.5 py-0">Best</Badge>
                        )}
                        {quote.isHighestRated && (
                            <Badge className="bg-amber-600 text-white text-[9px] px-1.5 py-0">Top</Badge>
                        )}
                    </div>
                </div>
            </div>

            {/* Certifications */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
                {quote.coriCertified && (
                    <Badge variant="outline" className="text-[9px] py-0 border-green-200 text-green-700">
                        <CheckCircle2 className="w-2.5 h-2.5 mr-1" />CORI
                    </Badge>
                )}
                {quote.insuranceVerified && (
                    <Badge variant="outline" className="text-[9px] py-0 border-blue-200 text-blue-700">
                        <Shield className="w-2.5 h-2.5 mr-1" />Insured
                    </Badge>
                )}
                <span className="text-[10px] text-neutral-400">{quote.vehicleCapacity} seats • {quote.responseTime}m response</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-3">
                <Button
                    size="sm"
                    className="flex-1 h-8 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                    onClick={handleAcceptClick}
                    disabled={isAccepted || isDeclined || isExpired}
                    title="Accept quote - FINAL decision"
                >
                    {isAccepted ? 'Accepted' : 'Accept'}
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2"
                    onClick={() => onMessage(quote.id)}
                >
                    <MessageSquare className="w-3.5 h-3.5" />
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-neutral-400 hover:text-red-600 text-xs"
                    onClick={() => onDecline(quote.id)}
                    disabled={isAccepted || isDeclined}
                >
                    Decline
                </Button>
            </div>
        </Card>
    );
}
