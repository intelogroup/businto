"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface OperatorRatingProps {
  rating: number;
  reviewCount: number;
  size?: "sm" | "md" | "lg";
  showCount?: boolean;
}

export function OperatorRating({
  rating,
  reviewCount,
  size = "md",
  showCount = true
}: OperatorRatingProps) {
  const starSize = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5"
  };

  const textSize = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base"
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              starSize[size],
              rating >= star
                ? "fill-amber-400 text-amber-400"
                : rating >= star - 0.5
                ? "fill-amber-400/50 text-amber-400"
                : "text-neutral-200"
            )}
          />
        ))}
      </div>
      <span className={cn("font-semibold text-neutral-900", textSize[size])}>
        {rating.toFixed(1)}
      </span>
      {showCount && (
        <span className={cn("text-neutral-500", textSize[size])}>
          ({reviewCount})
        </span>
      )}
    </div>
  );
}
