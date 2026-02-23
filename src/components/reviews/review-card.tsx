"use client";

import { Star, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface ReviewCardProps {
  review: {
    id: string;
    rating: number;
    comment?: string;
    created_at: string;
    operator_response?: string;
    operator_response_at?: string;
    user?: {
      full_name: string;
      avatar_url?: string;
    };
    booking?: {
      request?: {
        service_type: string;
      };
    };
  };
  showUser?: boolean;
}

export function ReviewCard({ review, showUser = true }: ReviewCardProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  const getServiceLabel = (type?: string) => {
    switch (type) {
      case "school":
        return "School Run";
      case "medical":
        return "Care Ride";
      case "wedding":
        return "Event Shuttle";
      default:
        return "Transport";
    }
  };

  return (
    <div className="border border-neutral-100 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        {showUser && (
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={review.user?.avatar_url} />
              <AvatarFallback className="bg-neutral-100">
                <User className="h-5 w-5 text-neutral-500" />
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-neutral-900">
                {review.user?.full_name || "Anonymous"}
              </p>
              <p className="text-xs text-neutral-500">
                {getServiceLabel(review.booking?.request?.service_type)} • {formatDate(review.created_at)}
              </p>
            </div>
          </div>
        )}

        {/* Stars */}
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={cn(
                "h-4 w-4",
                review.rating >= star
                  ? "fill-amber-400 text-amber-400"
                  : "text-neutral-200"
              )}
            />
          ))}
        </div>
      </div>

      {/* Comment */}
      {review.comment && (
        <p className="text-sm text-neutral-600 mb-3">{review.comment}</p>
      )}

      {/* Operator Response */}
      {review.operator_response && (
        <div className="bg-neutral-50 rounded-lg p-3 mt-3">
          <p className="text-xs font-semibold text-neutral-500 mb-1">
            Operator Response
          </p>
          <p className="text-sm text-neutral-700">{review.operator_response}</p>
          {review.operator_response_at && (
            <p className="text-xs text-neutral-400 mt-2">
              {formatDate(review.operator_response_at)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
