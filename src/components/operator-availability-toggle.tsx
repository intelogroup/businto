"use client";

import { useState, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

/**
 * OperatorAvailabilityToggle
 *
 * Self-contained component that fetches and toggles the operator's
 * `is_accepting_requests` flag. Drop into any operator-facing page.
 *
 * When paused, the operator will not appear in new request matching.
 * Existing quotes and bookings are unaffected.
 */
export function OperatorAvailabilityToggle() {
  const [isAccepting, setIsAccepting] = useState<boolean | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/operator/availability");
      if (!res.ok) return; // Silently fail for non-operators
      const data = await res.json();
      setIsAccepting(data.isAcceptingRequests);
    } catch {
      // Non-operator or network issue — hide toggle
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleToggle = async (checked: boolean) => {
    setIsUpdating(true);
    setError(null);

    try {
      const res = await fetch("/api/operator/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAcceptingRequests: checked }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update");
      }

      const data = await res.json();
      setIsAccepting(data.isAcceptingRequests);
    } catch (err: any) {
      setError(err.message);
      // Revert optimistic update
      setIsAccepting(!checked);
    } finally {
      setIsUpdating(false);
    }
  };

  // Don't render until we know the operator status
  if (isAccepting === null) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-900">
            Accepting New Requests
          </span>
          {isUpdating && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />
          )}
        </div>
        <p className="text-xs text-neutral-500 mt-0.5">
          {isAccepting
            ? "You'll be matched with new transport requests."
            : "You're paused. No new requests will be sent to you."}
        </p>
        {error && (
          <p className="text-xs text-red-500 mt-1">{error}</p>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Badge
          className={
            isAccepting
              ? "bg-green-100 text-green-700 text-[10px] h-5 px-1.5 font-semibold"
              : "bg-neutral-100 text-neutral-500 text-[10px] h-5 px-1.5 font-semibold"
          }
        >
          {isAccepting ? "Online" : "Paused"}
        </Badge>
        <Switch
          checked={isAccepting}
          onCheckedChange={handleToggle}
          disabled={isUpdating}
          aria-label="Toggle accepting new requests"
        />
      </div>
    </div>
  );
}
