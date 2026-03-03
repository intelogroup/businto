"use client";

import { Quote } from "@/types/quotes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Star, CheckCircle2, Shield, User, MessageSquare, TrendingDown, Award, Phone, Mail, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

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
  const isExpired = quote.status === 'expired';

  const handleAcceptClick = () => {
    // MARKETPLACE INTEGRITY: Clear warning before acceptance
    const confirmed = window.confirm(
      `⚠️ IMPORTANT: Once you accept this ${quote.totalPrice === 0 ? 'estimate' : 'quote'}, your decision is FINAL.\n\n` +
      `✓ You will be locked to ${quote.operatorName}\n` +
      `✓ All other quotes will be permanently closed\n` +
      `✓ You cannot switch operators\n` +
      `✓ To choose a different operator, you must create a new request\n\n` +
      (quote.totalPrice === 0 ?
        `Lock Job to ${quote.operatorName} and finalize pricing directly?` :
        `Accept ${quote.operatorName}'s quote for $${quote.totalPrice}?`)
    );

    if (confirmed) {
      onAccept(quote.id);
    }
  };

  return (
    <div
      className={cn(
        "relative",
        isAccepted && "pointer-events-none opacity-60",
        isDeclined && "hidden"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <Card className={cn(
        "p-6 space-y-5 transition-colors duration-150 border-neutral-200 shadow-sm relative overflow-hidden",
        quote.isLowestPrice && "border-green-500 bg-green-50/10",
        quote.isHighestRated && "border-amber-500 bg-amber-50/10"
      )}>
        {/* Status Badges */}
        <div className="absolute top-4 right-4 flex gap-2">
          {isNew && (
            <Badge className="bg-sky-600 text-white font-bold text-[10px] h-5 px-1.5">NEW</Badge>
          )}
          {quote.isLowestPrice && (
            <Badge className="bg-green-600 text-white flex items-center gap-1 font-bold text-[10px] h-5 px-1.5">
              <TrendingDown className="w-3 h-3" />
              BEST PRICE
            </Badge>
          )}
          {quote.isHighestRated && (
            <Badge className="bg-amber-600 text-white flex items-center gap-1 font-bold text-[10px] h-5 px-1.5">
              <Award className="w-3 h-3" />
              TOP RATED
            </Badge>
          )}
          {isAccepted && (
            <Badge className="bg-green-600 text-white flex items-center gap-1 font-bold text-[10px] h-5 px-1.5">
              <CheckCircle2 className="w-3 h-3" />
              ACCEPTED
            </Badge>
          )}
        </div>

        {/* Operator Profile */}
        <div className="flex items-start gap-4 pr-24">
          <Avatar className="h-12 w-12 border border-neutral-200">
            <AvatarImage src={quote.operatorAvatar} />
            <AvatarFallback className="bg-neutral-900 text-white font-semibold text-sm">
              {quote.operatorName.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h3 className="font-semibold text-lg text-neutral-900">{quote.operatorName}</h3>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="font-semibold text-sm text-neutral-700">{quote.operatorRating.toFixed(1)}</span>
                <span className="text-xs text-neutral-400">({quote.operatorReviewCount} reviews)</span>
              </div>
              <span className="text-xs text-neutral-300">•</span>
              <span className="text-xs text-neutral-500 font-medium">
                {quote.responseTime}m response
              </span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              {quote.coriCertified && (
                <Badge variant="outline" className="text-[10px] font-bold h-5 px-1.5 flex items-center gap-1 border-neutral-200 text-neutral-600 uppercase">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  CORI
                </Badge>
              )}
              {quote.insuranceVerified && (
                <Badge variant="outline" className="text-[10px] font-bold h-5 px-1.5 flex items-center gap-1 border-neutral-200 text-neutral-600 uppercase">
                  <Shield className="w-2.5 h-2.5" />
                  Insured
                </Badge>
              )}
              {quote.wheelchairAccessible && (
                <Badge variant="outline" className="text-[10px] font-bold h-5 px-1.5 flex items-center gap-1 border-neutral-200 text-neutral-600 uppercase">
                  <User className="w-2.5 h-2.5" />
                  ADA
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Price Breakdown */}
        <div className="bg-neutral-50 rounded-lg p-5 border border-neutral-100">
          <div className="flex items-baseline justify-between mb-4">
            <div className="text-3xl font-semibold text-neutral-900">
              {quote.totalPrice === 0 ? "TBD" : `$${quote.totalPrice}`}
            </div>
            {quote.totalPrice === 0 && (
              <Badge className="bg-sky-600 text-white font-bold text-[10px] h-5 px-1.5">
                ESTIMATE
              </Badge>
            )}
            {quote.discount && quote.totalPrice > 0 && (
              <Badge className="bg-red-600 text-white font-bold text-[10px] h-5 px-1.5">
                {quote.discount.percentage}% OFF
              </Badge>
            )}
          </div>
          
          {quote.totalPrice > 0 && (
            <div className="space-y-2 text-sm pt-4 border-t border-neutral-200/60">
              <div className="flex justify-between text-neutral-500">
                <span className="font-medium">Base fare</span>
                <span className="font-semibold text-neutral-900">${quote.baseFare}</span>
              </div>
              {quote.distanceCharge > 0 && (
                <div className="flex justify-between text-neutral-500">
                  <span className="font-medium">Distance charge</span>
                  <span className="font-semibold text-neutral-900">${quote.distanceCharge}</span>
                </div>
              )}
              {quote.additionalFees?.map((fee, idx) => (
                <div key={idx} className="flex justify-between text-neutral-500">
                  <span className="font-medium">{fee.name}</span>
                  <span className="font-semibold text-neutral-900">${fee.amount}</span>
                </div>
              ))}
              {quote.discount && (
                <div className="flex justify-between text-red-600 font-semibold pt-2 border-t border-neutral-200/60 mt-2">
                  <span>{quote.discount.reason}</span>
                  <span>-${(quote.totalPrice * quote.discount.percentage / 100).toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-neutral-200/60 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-neutral-500 leading-normal">
              <strong>Routing Fee:</strong> A one-time <strong>$1.99 fee</strong> applies after acceptance. Trip total is paid directly to the operator.
            </p>
          </div>
        </div>

        {/* Vehicle & Note */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-neutral-100">
            {quote.vehiclePhoto && (
              <div className="w-12 h-12 rounded bg-neutral-100 shrink-0 overflow-hidden">
                <img src={quote.vehiclePhoto} alt={quote.vehicleType} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="min-w-0">
              <div className="font-semibold text-sm text-neutral-900 truncate">{quote.vehicleYear} {quote.vehicleType}</div>
              <div className="text-[11px] text-neutral-400 font-medium">Capacity: {quote.vehicleCapacity} pax</div>
            </div>
          </div>

          {quote.operatorNote && (
            <div className="bg-sky-50/50 rounded-lg p-3 border border-sky-100 flex items-start gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
              <p className="text-xs text-sky-900 leading-relaxed line-clamp-2">"{quote.operatorNote}"</p>
            </div>
          )}
        </div>

        {/* Contact Info - Visible After Accepting */}
        {(isAccepted || (quote.totalPrice === 0 && (quote.operatorPhone || quote.operatorEmail))) && (
          <div className={cn(
            "rounded-lg p-4 border",
            isAccepted ? "bg-green-50 border-green-200" : "bg-sky-50 border-sky-200"
          )}>
            <h4 className={cn(
              "text-sm font-semibold mb-3 flex items-center gap-2",
              isAccepted ? "text-green-900" : "text-sky-900"
            )}>
              {isAccepted ? <CheckCircle2 className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
              {isAccepted ? "Booking Confirmed" : "Contact Operator to Finalize"}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {quote.operatorPhone && (
                <a href={`tel:${quote.operatorPhone}`} className="flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-black bg-white p-2 rounded border border-neutral-100">
                  <Phone className="w-3.5 h-3.5 text-neutral-400" />
                  {quote.operatorPhone}
                </a>
              )}
              {quote.operatorEmail && (
                <a href={`mailto:${quote.operatorEmail}`} className="flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-black bg-white p-2 rounded border border-neutral-100">
                  <Mail className="w-3.5 h-3.5 text-neutral-400" />
                  {quote.operatorEmail}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        {!isAccepted && (
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              className="flex-1 bg-neutral-900 hover:bg-black text-white font-semibold h-10 rounded-md shadow-sm"
              onClick={handleAcceptClick}
              disabled={isAccepted || isDeclined || isExpired}
            >
              {quote.totalPrice === 0 ? 'Lock Job with Operator' : 'Accept Quote & Book'}
            </Button>
            <Button
              variant="outline"
              className="flex items-center gap-2 h-10 rounded-md border-neutral-200 font-semibold"
              onClick={() => onMessage(quote.id)}
            >
              <MessageSquare className="w-4 h-4" />
              Message
            </Button>
            <Button
              variant="ghost"
              className="text-neutral-400 hover:text-red-600 hover:bg-red-50 h-10 font-medium"
              onClick={() => onDecline(quote.id)}
              disabled={isAccepted || isDeclined}
            >
              Decline
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
