"use client";

import { Quote } from "@/types/quotes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Star, CheckCircle2, Shield, User, MessageSquare, TrendingDown, Award, Phone, Mail } from "lucide-react";
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
    <motion.div
      initial={isNew ? { scale: 0.95, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", duration: 0.5 }}
      className={cn(
        "relative",
        isAccepted && "pointer-events-none opacity-60",
        isDeclined && "hidden"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <Card className={cn(
        "p-6 space-y-4 transition-all hover:shadow-lg relative overflow-hidden",
        quote.isLowestPrice && "border-2 border-green-500 shadow-green-100",
        quote.isHighestRated && "border-2 border-amber-500 shadow-amber-100",
        isNew && "animate-pulse-border"
      )}>
        {/* Status Badges */}
        <div className="absolute top-4 right-4 flex gap-2">
          {isNew && (
            <Badge className="bg-indigo-600 text-white animate-pulse">NEW</Badge>
          )}
          {quote.isLowestPrice && (
            <Badge className="bg-green-600 text-white flex items-center gap-1">
              <TrendingDown className="w-3 h-3" />
              Best Price
            </Badge>
          )}
          {quote.isHighestRated && (
            <Badge className="bg-amber-600 text-white flex items-center gap-1">
              <Award className="w-3 h-3" />
              Top Rated
            </Badge>
          )}
          {isAccepted && (
            <Badge className="bg-green-600 text-white flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Accepted
            </Badge>
          )}
        </div>

        {/* Operator Profile */}
        <div className="flex items-start gap-4 pr-24">
          <Avatar className="h-14 w-14 border-2 border-neutral-200">
            <AvatarImage src={quote.operatorAvatar} />
            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold">
              {quote.operatorName.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h3 className="font-bold text-lg text-neutral-900">{quote.operatorName}</h3>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="font-semibold text-sm">{quote.operatorRating.toFixed(1)}</span>
                <span className="text-xs text-neutral-500">({quote.operatorReviewCount})</span>
              </div>
              <span className="text-xs text-neutral-300">•</span>
              <span className="text-xs text-neutral-500">
                Responded in {quote.responseTime} min{quote.responseTime !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              {quote.coriCertified && (
                <Badge variant="outline" className="text-[10px] flex items-center gap-1 border-green-200 text-green-700">
                  <CheckCircle2 className="w-3 h-3" />
                  CORI
                </Badge>
              )}
              {quote.insuranceVerified && (
                <Badge variant="outline" className="text-[10px] flex items-center gap-1 border-blue-200 text-blue-700">
                  <Shield className="w-3 h-3" />
                  Insured
                </Badge>
              )}
              {quote.wheelchairAccessible && (
                <Badge variant="outline" className="text-[10px] flex items-center gap-1 border-purple-200 text-purple-700">
                  <User className="w-3 h-3" />
                  Accessible
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Price Breakdown */}
        <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-100">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
            <p className="text-xs text-amber-900">
              <strong>⚠️ Note:</strong> After accepting, you'll pay a <strong>$1.99 platform routing fee</strong> to connect with this operator. The trip cost shown below will be paid directly to the operator.
            </p>
          </div>
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-3xl font-black text-neutral-900">
              {quote.totalPrice === 0 ? "TBD" : `$${quote.totalPrice}`}
            </div>
            {quote.totalPrice === 0 && (
              <Badge className="bg-blue-600 text-white animate-pulse">
                Needs Discussion
              </Badge>
            )}
            {quote.discount && quote.totalPrice > 0 && (
              <Badge className="bg-red-600 text-white">
                {quote.discount.percentage}% OFF
              </Badge>
            )}
          </div>
          {quote.totalPrice > 0 && (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Base fare</span>
                <span className="font-semibold">${quote.baseFare}</span>
              </div>
              {quote.distanceCharge && (
                <div className="flex justify-between text-neutral-600">
                  <span>Distance charge</span>
                  <span className="font-semibold">${quote.distanceCharge}</span>
                </div>
              )}
              {quote.additionalFees?.map((fee, idx) => (
                <div key={idx} className="flex justify-between text-neutral-600">
                  <span>{fee.name}</span>
                  <span className="font-semibold">${fee.amount}</span>
                </div>
              ))}
              {quote.discount && (
                <div className="flex justify-between text-red-600 font-semibold pt-1 border-t border-neutral-200">
                  <span>{quote.discount.reason}</span>
                  <span>-${(quote.totalPrice * quote.discount.percentage / 100).toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Vehicle Info */}
        <div className="flex items-center gap-4 bg-white rounded-xl p-4 border border-neutral-100">
          {quote.vehiclePhoto && (
            <div className="w-20 h-20 rounded-lg overflow-hidden bg-neutral-100">
              <img src={quote.vehiclePhoto} alt={quote.vehicleType} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1">
            <div className="font-bold text-neutral-900">{quote.vehicleYear} {quote.vehicleType}</div>
            <div className="text-sm text-neutral-500 mt-1">
              Capacity: {quote.vehicleCapacity} passengers
            </div>
          </div>
        </div>

        {/* Operator Note */}
        {quote.operatorNote && (
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 mb-4">
            <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">
              Operator Note
            </div>
            <p className="text-sm text-neutral-700 italic">"{quote.operatorNote}"</p>
          </div>
        )}

        {/* Estimate Contact Info - Visible Before Accepting */}
        {quote.totalPrice === 0 && (quote.operatorPhone || quote.operatorEmail) && (
          <div className="bg-green-50 rounded-xl p-4 border border-green-200 mb-4">
            <h4 className="text-sm font-bold text-green-900 mb-2">Discuss Details with Operator</h4>
            <p className="text-xs text-green-800 mb-3">
              This operator is interested but needs to discuss details before providing a fixed price. Reach out to them directly:
            </p>
            <div className="space-y-2">
              {quote.operatorPhone && (
                <div className="flex items-center gap-2 text-sm text-green-900 font-medium">
                  <Phone className="w-4 h-4 text-green-600" />
                  <a href={`tel:${quote.operatorPhone}`} className="hover:underline">{quote.operatorPhone}</a>
                </div>
              )}
              {quote.operatorEmail && (
                <div className="flex items-center gap-2 text-sm text-green-900 font-medium">
                  <Mail className="w-4 h-4 text-green-600" />
                  <a href={`mailto:${quote.operatorEmail}`} className="hover:underline">{quote.operatorEmail}</a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold h-12 rounded-xl shadow-lg shadow-indigo-500/20"
            onClick={handleAcceptClick}
            disabled={isAccepted || isDeclined || isExpired}
            title={isAccepted ? 'Already accepted' : 'Accept this operator - FINAL decision'}
          >
            {isAccepted ? 'Accepted & Locked' : (quote.totalPrice === 0 ? 'Lock Job with Operator' : 'Accept Quote & Lock Job')}
          </Button>
          <Button
            variant="outline"
            className="flex items-center gap-2 h-12 rounded-xl border-2"
            onClick={() => onMessage(quote.id)}
          >
            <MessageSquare className="w-4 h-4" />
            Message
          </Button>
          <Button
            variant="ghost"
            className="text-neutral-500 hover:text-red-600 h-12"
            onClick={() => onDecline(quote.id)}
            disabled={isAccepted || isDeclined}
          >
            Decline
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
