"use client";

import { Quote } from "@/types/quotes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Star, CheckCircle2, MessageSquare, Phone, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuoteCardProps {
  quote: Quote;
  isNew?: boolean;
  onAccept: (quoteId: string) => void;
  onDecline: (quoteId: string) => void;
  onMessage: (quoteId: string) => void;
}

export function QuoteCard({ quote, isNew, onAccept, onDecline, onMessage }: QuoteCardProps) {
  const isAccepted = quote.status === 'accepted';
  const isDeclined = quote.status === 'declined';
  const isExpired  = quote.status === 'expired';

  const certs = [
    quote.coriCertified        && 'CORI',
    quote.insuranceVerified    && 'Insured',
    quote.wheelchairAccessible && 'ADA',
  ].filter(Boolean).join(' · ');

  return (
    <div
      className={cn(
        "relative",
        isAccepted && "pointer-events-none opacity-60",
        isDeclined && "hidden"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <Card className="p-5 transition-colors duration-150 border-neutral-200">

        {/* Operator row */}
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9 shrink-0 border border-neutral-200">
            <AvatarImage src={quote.operatorAvatar} />
            <AvatarFallback className="bg-neutral-900 text-white text-xs font-semibold">
              {quote.operatorName.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-semibold text-sm text-neutral-900 truncate">{quote.operatorName}</h3>
              <span className="text-lg font-semibold text-neutral-900 shrink-0 tabular-nums">
                {quote.totalPrice === 0 ? 'TBD' : `$${quote.totalPrice}`}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
              <span className="text-xs font-medium text-neutral-600">{quote.operatorRating.toFixed(1)}</span>
              <span className="text-xs text-neutral-300">·</span>
              <span className="text-xs text-neutral-400">{quote.operatorReviewCount} reviews</span>
              {certs && (
                <>
                  <span className="text-xs text-neutral-300">·</span>
                  <span className="text-xs text-neutral-400">{certs}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Vehicle */}
        <p className="text-xs text-neutral-500 mt-3">
          {quote.vehicleYear} {quote.vehicleType} · {quote.vehicleCapacity} passengers
        </p>

        {/* Operator note */}
        {quote.operatorNote && (
          <p className="text-xs text-neutral-500 italic mt-2 line-clamp-2">"{quote.operatorNote}"</p>
        )}

        {/* Status badges */}
        {(isNew || isAccepted) && (
          <div className="flex gap-2 mt-3">
            {isNew && (
              <Badge className="bg-sky-600 text-white text-[10px] h-5 px-1.5">New</Badge>
            )}
            {isAccepted && (
              <Badge className="bg-green-600 text-white text-[10px] h-5 px-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Accepted
              </Badge>
            )}
          </div>
        )}

        {/* Contact info — visible after accepting or for TBD quotes */}
        {(isAccepted || (quote.totalPrice === 0 && (quote.operatorPhone || quote.operatorEmail))) && (
          <div className="mt-3 pt-3 border-t border-neutral-100 flex flex-wrap gap-4">
            {quote.operatorPhone && (
              <a href={`tel:${quote.operatorPhone}`} className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-900 transition-colors">
                <Phone className="w-3 h-3" />
                {quote.operatorPhone}
              </a>
            )}
            {quote.operatorEmail && (
              <a href={`mailto:${quote.operatorEmail}`} className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-900 transition-colors">
                <Mail className="w-3 h-3" />
                {quote.operatorEmail}
              </a>
            )}
          </div>
        )}

        {/* Actions */}
        {!isAccepted && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-neutral-100">
            <Button
              className="flex-1 h-8 text-sm bg-neutral-900 hover:bg-black text-white font-medium rounded"
              onClick={() => onAccept(quote.id)}
              disabled={isDeclined || isExpired}
            >
              {quote.totalPrice === 0 ? 'Lock in with Operator' : 'Accept & Book'}
            </Button>
            <Button
              variant="outline"
              className="h-8 px-3 rounded border-neutral-200"
              onClick={() => onMessage(quote.id)}
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              className="h-8 px-3 text-sm text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded"
              onClick={() => onDecline(quote.id)}
              disabled={isDeclined}
            >
              Decline
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
