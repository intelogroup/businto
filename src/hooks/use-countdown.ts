"use client";

import { useState, useEffect, useCallback } from "react";

export interface CountdownResult {
  /** Total remaining seconds (negative = expired) */
  totalSeconds: number;
  /** Whether the countdown has reached zero */
  isExpired: boolean;
  /** Human-readable label, e.g. "2h 15m" or "Expired" */
  label: string;
  /** Urgency tier for styling: "normal" | "warning" | "critical" | "expired" */
  urgency: "normal" | "warning" | "critical" | "expired";
}

/**
 * Returns a live countdown from `now` to `expiresAt`.
 *
 * Updates every second when < 1 hour, every 30 seconds otherwise.
 * Returns `{ totalSeconds, isExpired, label, urgency }`.
 */
export function useCountdown(expiresAt: Date | string | null | undefined): CountdownResult {
  const getRemaining = useCallback(() => {
    if (!expiresAt) return Infinity;
    const target = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
    return Math.floor((target.getTime() - Date.now()) / 1000);
  }, [expiresAt]);

  const [remaining, setRemaining] = useState<number>(getRemaining);

  useEffect(() => {
    setRemaining(getRemaining());

    const tick = () => setRemaining(getRemaining());
    // Tick every second when under 1 hour, otherwise every 30 s
    const interval = remaining < 3600 ? 1000 : 30_000;
    const id = setInterval(tick, interval);
    return () => clearInterval(id);
  }, [getRemaining, remaining < 3600]);

  if (!expiresAt || remaining === Infinity) {
    return { totalSeconds: Infinity, isExpired: false, label: "", urgency: "normal" };
  }

  if (remaining <= 0) {
    return { totalSeconds: remaining, isExpired: true, label: "Expired", urgency: "expired" };
  }

  const hours = Math.floor(remaining / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  const secs = remaining % 60;

  let label: string;
  if (hours > 0) {
    label = `${hours}h ${mins}m`;
  } else if (mins > 0) {
    label = `${mins}m ${secs}s`;
  } else {
    label = `${secs}s`;
  }

  let urgency: CountdownResult["urgency"];
  if (remaining <= 300) {
    urgency = "critical"; // < 5 min
  } else if (remaining <= 1800) {
    urgency = "warning"; // < 30 min
  } else {
    urgency = "normal";
  }

  return { totalSeconds: remaining, isExpired: false, label, urgency };
}
