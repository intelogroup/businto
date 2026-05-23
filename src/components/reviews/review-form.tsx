"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNotifications } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

interface ReviewFormProps {
  bookingId: string;
  operatorId: string;
  operatorName: string;
  userId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ReviewForm({
  bookingId,
  operatorId,
  operatorName,
  userId,
  onSuccess,
  onCancel
}: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { addNotification } = useNotifications();

  const handleSubmit = async () => {
    if (rating === 0) {
      addNotification({
        title: "Rating Required",
        message: "Please select a star rating",
        type: "error"
      });
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: bookingId,
          user_id: userId,
          operator_id: operatorId,
          rating,
          comment: comment.trim() || null
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit review");
      }

      addNotification({
        title: "Review Submitted",
        message: "Thank you for your feedback!",
        type: "success"
      });

      onSuccess?.();
    } catch (error: any) {
      addNotification({
        title: "Error",
        message: error.message,
        type: "error"
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="font-semibold text-lg text-neutral-900 mb-2">
          Rate your experience with {operatorName}
        </h3>
        <p className="text-sm text-neutral-500">
          Your feedback helps other users and operators
        </p>
      </div>

      {/* Star Rating */}
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            className="p-1 transition-colors duration-150 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2"
          >
            <Star
              className={cn(
                "h-8 w-8 transition-colors",
                (hoverRating || rating) >= star
                  ? "fill-amber-400 text-amber-400"
                  : "text-neutral-300"
              )}
            />
          </button>
        ))}
      </div>

      {/* Rating Label */}
      <div className="text-center">
        <span className="text-sm font-medium text-neutral-600">
          {rating === 0 && "Select a rating"}
          {rating === 1 && "Poor"}
          {rating === 2 && "Fair"}
          {rating === 3 && "Good"}
          {rating === 4 && "Very Good"}
          {rating === 5 && "Excellent"}
        </span>
      </div>

      {/* Comment */}
      <div>
        <Textarea
          placeholder="Share your experience (optional)..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          className="resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          disabled={rating === 0 || submitting}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700"
        >
          {submitting ? "Submitting..." : "Submit Review"}
        </Button>
      </div>
    </div>
  );
}
